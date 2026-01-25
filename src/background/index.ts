/**
 * Background script entry point.
 * Handles message passing, alarms, and extension lifecycle.
 */
import type Browser from "webextension-polyfill";
import { browser, createAlarm, onAlarm, onMessage } from "@shared/browser";
import { matchCodesToDomain, setCustomMappings } from "@shared/domain-matcher";
import { deriveKey, decryptBoxBytes, toB64 } from "@shared/crypto";
import type {
    ExtensionMessage,
    ExtensionResponse,
    WebLoginCredentials,
} from "@shared/types";
import { getAuthState, login, logout, unlock } from "./auth";
import { settingsStorage, authStorage, customMappingsStorage } from "./storage";
import { getCodes, getTimeOffset, syncCodes } from "./sync";

const SYNC_ALARM_NAME = "ente-auth-sync";

/**
 * Initialize the background script.
 */
const init = async () => {
    console.log("Ente Auth extension background script initialized");

    // Set up periodic sync alarm
    const settings = await settingsStorage.getSettings();
    await createAlarm(SYNC_ALARM_NAME, settings.syncInterval);

    // Handle alarm events
    onAlarm(async (alarm) => {
        if (alarm.name === SYNC_ALARM_NAME) {
            console.log("Sync alarm triggered");
            try {
                await syncCodes();
            } catch (e) {
                console.error("Sync alarm failed:", e);
            }
        }
    });

    // Handle messages from popup and content scripts
    onMessage((message, sender, sendResponse) => {
        handleMessage(message as ExtensionMessage, sender)
            .then(sendResponse)
            .catch((error) => {
                console.error("Message handler error:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response
    });
};

/**
 * Validate that a message sender is from a trusted extension context.
 */
const isValidSender = (sender: Browser.Runtime.MessageSender): boolean => {
    // Allow messages from extension pages (popup, options, background)
    if (sender.id === browser.runtime.id) {
        // Extension's own pages are always trusted
        // Note: In Firefox, sender.url uses a UUID different from browser.runtime.id,
        // so we just check for the extension protocol prefix
        if (sender.url?.startsWith("chrome-extension://") ||
            sender.url?.startsWith("moz-extension://")) {
            return true;
        }
        // Content scripts on allowed domains
        if (sender.url) {
            try {
                const url = new URL(sender.url);
                const allowedDomains = ["auth.ente.io", "web.ente.io"];
                if (allowedDomains.includes(url.hostname)) {
                    return true;
                }
            } catch {
                // Invalid URL, fall through
            }
        }
        // Messages from content scripts on other domains (for autofill)
        // These are still from our extension, just injected into pages
        if (sender.tab?.id !== undefined) {
            return true;
        }
    }
    return false;
};

/**
 * Handle incoming messages.
 */
const handleMessage = async (
    message: ExtensionMessage,
    sender: Browser.Runtime.MessageSender
): Promise<ExtensionResponse> => {
    // Validate sender before processing any message
    if (!isValidSender(sender)) {
        console.warn("Rejected message from untrusted sender:", sender.url);
        return { success: false, error: "Unauthorized" };
    }

    switch (message.type) {
        case "GET_AUTH_STATE": {
            const state = await getAuthState();
            return { success: true, data: state };
        }

        case "LOGIN": {
            try {
                // In a real implementation, this would be called from the auth.ente.io callback
                // For now, we expect token and keyAttributes to be passed directly
                await login(message.token, message.keyAttributes, "");
                return { success: true };
            } catch (e) {
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Login failed",
                };
            }
        }

        case "LOGIN_SRP": {
            // Deprecated: Use OPEN_WEB_LOGIN instead
            return {
                success: false,
                error: "Please use the web login option instead.",
            };
        }

        case "OPEN_WEB_LOGIN": {
            try {
                // Open auth.ente.io in a new tab for the user to log in
                await browser.tabs.create({ url: "https://auth.ente.io" });
                return { success: true };
            } catch (e) {
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Failed to open login page",
                };
            }
        }

        case "WEB_LOGIN_CREDENTIALS": {
            try {
                const credentials = message.credentials as WebLoginCredentials;

                // Store credentials
                await login(credentials.token, credentials.keyAttributes, credentials.email);

                // Get master key - prefer the one from session storage (already decrypted)
                let masterKey = credentials.masterKey;

                // Only try password derivation if we don't have masterKey
                if (!masterKey && credentials.password) {
                    // Derive KEK from password
                    const kek = await deriveKey(
                        credentials.password,
                        credentials.keyAttributes.kekSalt,
                        credentials.keyAttributes.opsLimit,
                        credentials.keyAttributes.memLimit
                    );
                    // Decrypt master key using KEK
                    const masterKeyBytes = await decryptBoxBytes(
                        {
                            encryptedData: credentials.keyAttributes.encryptedKey,
                            nonce: credentials.keyAttributes.keyDecryptionNonce,
                        },
                        kek
                    );
                    masterKey = await toB64(masterKeyBytes);
                }

                if (masterKey) {
                    await authStorage.setMasterKey(masterKey);

                    // Sync codes after successful login
                    try {
                        await syncCodes();
                    } catch (syncError) {
                        console.error("Failed to sync after login:", syncError);
                    }
                    return { success: true };
                } else {
                    return { success: false, error: "No master key - please unlock manually" };
                }
            } catch (e) {
                console.error("Web login error:", e);
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Login failed",
                };
            }
        }

        case "UNLOCK": {
            try {
                const success = await unlock(message.password);
                if (success) {
                    // Sync codes after unlocking (don't block on sync failure)
                    syncCodes().catch((syncError) => {
                        console.error("Failed to sync after unlock:", syncError);
                    });
                    return { success: true };
                }
                return { success: false, error: "Invalid password" };
            } catch (e) {
                return {
                    success: false,
                    error:
                        e instanceof Error ? e.message : "Failed to unlock",
                };
            }
        }

        case "LOGOUT": {
            await logout();
            return { success: true };
        }

        case "GET_CODES": {
            const codes = await getCodes();
            const timeOffset = await getTimeOffset();
            return { success: true, data: { codes, timeOffset } };
        }

        case "GET_CODES_FOR_DOMAIN": {
            const codes = await getCodes();
            // Load and set custom mappings before matching
            const customMappings = await customMappingsStorage.getMappings();
            setCustomMappings(customMappings);
            const matches = matchCodesToDomain(codes, message.domain);
            const timeOffset = await getTimeOffset();
            return { success: true, data: { matches, timeOffset } };
        }

        case "SYNC_CODES": {
            try {
                const codes = await syncCodes();
                return { success: true, data: { codesCount: codes.length } };
            } catch (e) {
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Sync failed",
                };
            }
        }

        case "GET_SETTINGS": {
            const settings = await settingsStorage.getSettings();
            return { success: true, data: settings };
        }

        case "SET_SETTINGS": {
            await settingsStorage.setSettings(message.settings);
            // Update sync alarm if interval changed
            if (message.settings.syncInterval !== undefined) {
                await createAlarm(SYNC_ALARM_NAME, message.settings.syncInterval);
            }
            return { success: true };
        }

        case "FILL_CODE": {
            // Send the code to the content script in the specified tab
            if (message.tabId) {
                try {
                    // Verify tab exists before sending message
                    const tab = await browser.tabs.get(message.tabId);
                    if (!tab) {
                        return { success: false, error: "Tab no longer exists" };
                    }
                    await browser.tabs.sendMessage(message.tabId, {
                        type: "FILL_OTP",
                        code: message.code,
                    });
                } catch (e) {
                    // Tab may have been closed or navigated away
                    return {
                        success: false,
                        error: e instanceof Error ? e.message : "Failed to fill code",
                    };
                }
            }
            return { success: true };
        }

        case "GET_CUSTOM_MAPPINGS": {
            const mappings = await customMappingsStorage.getMappings();
            return { success: true, data: mappings };
        }

        case "ADD_CUSTOM_MAPPING": {
            try {
                await customMappingsStorage.addMapping(message.mapping);
                return { success: true };
            } catch (e) {
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Failed to add mapping",
                };
            }
        }

        case "DELETE_CUSTOM_MAPPING": {
            try {
                await customMappingsStorage.deleteMapping(message.domain);
                return { success: true };
            } catch (e) {
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Failed to delete mapping",
                };
            }
        }

        default:
            return { success: false, error: "Unknown message type" };
    }
};

// Initialize when the script loads
init();
