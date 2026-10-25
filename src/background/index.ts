/**
 * Background script entry point.
 * Handles message passing, alarms, and extension lifecycle.
 */
import type Browser from "webextension-polyfill";
import { browser, createAlarm, onAlarm, onMessage, onIdleStateChange, setIdleDetectionInterval } from "@shared/browser";
import { resolveAccentColor } from "@shared/accent";
import { updateToolbarIcon } from "@shared/icon";
import { matchCodesToDomain, setCustomMappings } from "@shared/domain-matcher";
import { setApiBaseUrl } from "@shared/api";
import type {
    ExtensionMessage,
    ExtensionResponse,
} from "@shared/types";
import { getAuthState, login, lock, logout, unlock, setPin, removePin, unlockWithPin, setPinLockOnRestart } from "./auth";
import { settingsStorage, authStorage, customMappingsStorage } from "./storage";
import { getCodes, getTimeOffset, syncCodes, createCode, updateCode, deleteCode } from "./sync";
import { scanQRFromPage } from "./qr-scanner";

const SYNC_ALARM_NAME = "ente-auth-sync";

// Messages that change login / lock state; open tabs are told so their
// inline autofill icon updates
const AUTH_CHANGING_MESSAGES = new Set<string>([
    "LOGIN",
    "LOGIN_COMPLETE",
    "UNLOCK",
    "UNLOCK_WITH_PIN",
    "LOCK",
    "LOGOUT",
]);

/**
 * Tell content scripts in every tab that auth state changed. They can't rely on
 * storage.onChanged for this: the unlocked master key lives in storage.session,
 * whose changes don't reach content scripts (issue #22).
 */
const broadcastAuthStateChanged = async (): Promise<void> => {
    const tabs = await browser.tabs.query({});
    await Promise.all(
        tabs.map((tab) =>
            tab.id === undefined
                ? undefined
                : browser.tabs.sendMessage(tab.id, { type: "AUTH_STATE_CHANGED" }).catch(() => {
                      // No content script in this tab (chrome:// pages, etc.)
                  })
        )
    );
};

// Register message listener immediately (synchronously) so it's available
// as soon as the service worker starts. This prevents "Receiving end does not exist"
// errors when the service worker is woken up by a message.
onMessage((message, sender, sendResponse) => {
    handleMessage(message as ExtensionMessage, sender)
        .then((response) => {
            sendResponse(response);
            const type = (message as ExtensionMessage).type;
            if (AUTH_CHANGING_MESSAGES.has(type) && (response as { success?: boolean })?.success) {
                void broadcastAuthStateChanged();
            }
        })
        .catch((error) => {
            console.error("Message handler error:", error);
            sendResponse({ success: false, error: error.message });
        });
    return true; // Keep message channel open for async response
});

// Register idle listener synchronously so it survives MV3 service-worker wake-ups.
onIdleStateChange((state) => {
    settingsStorage.getSettings().then((settings) => {
        const t = settings.vaultTimeout;
        if (state === "locked" && t !== "never" && t !== "onRestart") {
            // System lock triggers all timeout modes except "never" and "onRestart"
            lock().then(broadcastAuthStateChanged).catch(console.error);
        } else if (state === "idle" && (t === "5" || t === "15" || t === "60" || t === "240")) {
            lock().then(broadcastAuthStateChanged).catch(console.error);
        }
    }).catch(console.error);
});

/**
 * Initialize the background script (async tasks like alarms).
 */
const init = async () => {
    console.log("Duckey background script initialized");

    // Set up periodic sync alarm and configure API URL
    const settings = await settingsStorage.getSettings();
    await createAlarm(SYNC_ALARM_NAME, settings.syncInterval);
    setApiBaseUrl(settings.serverUrl);

    // Toolbar icon follows the accent color
    updateToolbarIcon(resolveAccentColor(settings.accentTheme, settings.accentCustomColor)).catch(console.error);

    // Configure idle detection interval for minute-based timeouts
    const minuteTimeouts = ["5", "15", "60", "240"] as const;
    if (minuteTimeouts.includes(settings.vaultTimeout as typeof minuteTimeouts[number])) {
        setIdleDetectionInterval(parseInt(settings.vaultTimeout) * 60);
    }

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
};

/**
 * Validate that a message sender is from a trusted extension context.
 */
const isValidSender = (sender: Browser.Runtime.MessageSender): boolean => {
    // Allow messages from extension pages (popup, options, login, background)
    if (sender.id === browser.runtime.id) {
        // Extension's own pages are always trusted
        // Note: In Firefox, sender.url uses a UUID different from browser.runtime.id,
        // so we just check for the extension protocol prefix
        if (sender.url?.startsWith("chrome-extension://") ||
            sender.url?.startsWith("moz-extension://")) {
            return true;
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

        case "LOGIN_COMPLETE": {
            try {
                await login(message.token, message.keyAttributes, message.email);
                await authStorage.setMasterKey(message.masterKey);

                // Sync codes after successful login
                try {
                    await syncCodes();
                } catch (syncError) {
                    console.error("Failed to sync after login:", syncError);
                }
                return { success: true };
            } catch (e) {
                console.error("Login complete error:", e);
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Login failed",
                };
            }
        }

        case "OPEN_LOGIN_PAGE": {
            try {
                await browser.tabs.create({
                    url: browser.runtime.getURL("login/index.html"),
                });
                return { success: true };
            } catch (e) {
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Failed to open login page",
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

        case "LOCK": {
            await lock();
            return { success: true };
        }

        case "GET_CODES": {
            const codes = await getCodes(message.forceSync);
            const timeOffset = await getTimeOffset();
            return { success: true, data: { codes, timeOffset } };
        }

        case "GET_CODES_FOR_DOMAIN": {
            const authState = await getAuthState();
            const codes = await getCodes();
            // Load and set custom mappings before matching
            const customMappings = await customMappingsStorage.getMappings();
            setCustomMappings(customMappings);
            const matches = matchCodesToDomain(codes, message.domain);
            const timeOffset = await getTimeOffset();
            return { success: true, data: { matches, timeOffset, authState } };
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
            // If vaultTimeout is changing, migrate the master key between storage locations
            if (message.settings.vaultTimeout !== undefined) {
                const currentKey = await authStorage.getMasterKey();
                if (currentKey) {
                    await settingsStorage.setSettings(message.settings);
                    await authStorage.setMasterKey(currentKey);
                } else {
                    await settingsStorage.setSettings(message.settings);
                }
            } else {
                await settingsStorage.setSettings(message.settings);
            }
            // Update sync alarm if interval changed
            if (message.settings.syncInterval !== undefined) {
                await createAlarm(SYNC_ALARM_NAME, message.settings.syncInterval);
            }
            // Update API URL if server URL changed
            if (message.settings.serverUrl !== undefined) {
                setApiBaseUrl(message.settings.serverUrl);
            }
            // Recolor the toolbar icon if the accent changed
            if (message.settings.accentTheme !== undefined || message.settings.accentCustomColor !== undefined) {
                const updated = await settingsStorage.getSettings();
                updateToolbarIcon(resolveAccentColor(updated.accentTheme, updated.accentCustomColor)).catch(console.error);
            }
            // Reconfigure idle detection interval if vaultTimeout changed
            if (message.settings.vaultTimeout !== undefined) {
                const minuteTimeouts = ["5", "15", "60", "240"] as const;
                if (minuteTimeouts.includes(message.settings.vaultTimeout as typeof minuteTimeouts[number])) {
                    setIdleDetectionInterval(parseInt(message.settings.vaultTimeout) * 60);
                }
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

        case "CREATE_CODE": {
            try {
                const result = await createCode(message.code);
                // Re-sync to get the new code in the cache
                await syncCodes();
                return { success: true, data: result };
            } catch (e) {
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Failed to create code",
                };
            }
        }

        case "UPDATE_CODE": {
            try {
                await updateCode(message.id, message.code);
                // Re-sync to get the updated code in the cache
                await syncCodes();
                return { success: true };
            } catch (e) {
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Failed to update code",
                };
            }
        }

        case "DELETE_CODE": {
            try {
                await deleteCode(message.id);
                // Re-sync to remove the code from the cache
                await syncCodes();
                return { success: true };
            } catch (e) {
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Failed to delete code",
                };
            }
        }

        case "UNLOCK_WITH_PIN": {
            try {
                const res = await unlockWithPin(message.pin);
                if (res.success) {
                    syncCodes().catch((e) => console.error("Sync after PIN unlock failed:", e));
                    return { success: true };
                }
                return { success: false, error: res.error || "Incorrect PIN", lockedOut: res.lockedOut };
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : "Failed to unlock" };
            }
        }

        case "SET_PIN": {
            try {
                await setPin(message.pin, message.lockOnRestart);
                return { success: true };
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : "Failed to set PIN" };
            }
        }

        case "SET_PIN_LOCK_ON_RESTART": {
            try {
                await setPinLockOnRestart(message.lockOnRestart);
                return { success: true };
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : "Failed to update PIN setting" };
            }
        }

        case "REMOVE_PIN": {
            try {
                await removePin();
                return { success: true };
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : "Failed to remove PIN" };
            }
        }

        case "SCAN_QR_FROM_PAGE": {
            const result = await scanQRFromPage();
            if (result.success) {
                return { success: true, data: result.data };
            }
            return { success: false, error: result.error || "Failed to scan QR code" };
        }

        default:
            return { success: false, error: "Unknown message type" };
    }
};

// Initialize when the script loads
init();
