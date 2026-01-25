/**
 * Content script that runs on auth.ente.io to capture login credentials.
 *
 * This script monitors for successful login and sends the credentials
 * back to the extension, avoiding the need to reimplement SRP.
 */

import { browser, onMessage } from "@shared/browser";
import { decryptBox } from "@shared/crypto";
import type { KeyAttributes } from "@shared/types";

interface CapturedCredentials {
    token: string;
    email: string;
    userId: number;
    masterKey: string | null;
    keyAttributes: KeyAttributes;
    password: string | null;
}

interface SessionKeyData {
    encryptedData: string;
    key: string;
    nonce: string;
}

// Store captured password from login form
let capturedPassword: string | null = null;
// Track if we've already sent credentials this page load
let credentialsSent = false;
// Track the last known encryptionKey to detect NEW logins
let lastSeenEncryptionKey: string | null = null;

/**
 * Capture password from login form at submission time.
 * We capture when the user clicks login/submit, not while typing.
 */
const setupPasswordCapture = () => {
    // Capture password on form submit (most reliable)
    document.addEventListener("submit", (e) => {
        const form = e.target as HTMLFormElement;
        const passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
        if (passwordInput?.value) {
            capturedPassword = passwordInput.value;
        }
    }, true);

    // Capture on Enter key in password field (for forms without submit event)
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const target = e.target as HTMLInputElement;
            if (target.type === "password" && target.value) {
                capturedPassword = target.value;
            }
        }
    }, true);

    // Capture on button click that might trigger login (for React apps without form submit)
    document.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button[type="submit"], button:not([type]), input[type="submit"]');
        if (button) {
            // Find the nearest form or password input
            const form = button.closest("form");
            const passwordInput = form
                ? form.querySelector('input[type="password"]') as HTMLInputElement
                : document.querySelector('input[type="password"]') as HTMLInputElement;

            if (passwordInput?.value) {
                capturedPassword = passwordInput.value;
            }
        }
    }, true);
};

/**
 * Decrypt the master key from session storage.
 */
const decryptMasterKey = async (sessionData: SessionKeyData): Promise<string> => {
    const { encryptedData, key, nonce } = sessionData;
    return decryptBox({ encryptedData, nonce }, key);
};

/**
 * Check if this is a NEW login (encryptionKey just appeared or changed).
 */
const isNewLogin = (): boolean => {
    const encryptionKeyJson = sessionStorage.getItem("encryptionKey");

    if (!encryptionKeyJson) {
        // No encryption key yet
        lastSeenEncryptionKey = null;
        return false;
    }

    if (encryptionKeyJson !== lastSeenEncryptionKey) {
        // Encryption key appeared or changed - this is a new login
        lastSeenEncryptionKey = encryptionKeyJson;
        return true;
    }

    return false;
};

/**
 * Check if the user is fully logged in and capture credentials.
 * Only returns credentials for NEW logins to avoid showing banner for stale sessions.
 */
const captureCredentials = async (forceCheck = false): Promise<CapturedCredentials | null> => {
    try {
        // Check localStorage for user data
        const userJson = localStorage.getItem("user");
        if (!userJson) return null;

        const user = JSON.parse(userJson);
        if (!user.token || !user.email || !user.id) return null;

        // Check localStorage for key attributes
        const keyAttributesJson = localStorage.getItem("keyAttributes");
        if (!keyAttributesJson) return null;

        const keyAttributes = JSON.parse(keyAttributesJson);

        // Check if this is a NEW login (not stale session data)
        const newLogin = isNewLogin();

        // Try to get master key from sessionStorage
        let masterKey: string | null = null;
        const encryptionKeyJson = sessionStorage.getItem("encryptionKey");
        if (encryptionKeyJson) {
            try {
                const sessionData: SessionKeyData = JSON.parse(encryptionKeyJson);
                masterKey = await decryptMasterKey(sessionData);
            } catch (e) {
                console.log("[Ente Extension] Could not decrypt master key from session");
            }
        }

        // We need either masterKey or password
        if (!masterKey && !capturedPassword) {
            console.log("[Ente Extension] Waiting for login completion");
            return null;
        }

        // Only proceed if this is a NEW login OR we have a captured password
        // This prevents showing banner for stale sessionStorage data
        if (!newLogin && !capturedPassword && !forceCheck) {
            console.log("[Ente Extension] Skipping stale session data");
            return null;
        }

        console.log("[Ente Extension] Captured credentials:", {
            email: user.email,
            hasToken: !!user.token,
            hasMasterKey: !!masterKey,
            hasPassword: !!capturedPassword,
            isNewLogin: newLogin,
        });

        return {
            token: user.token,
            email: user.email,
            userId: user.id,
            masterKey,
            keyAttributes,
            password: capturedPassword,
        };
    } catch (e) {
        console.error("[Ente Extension] Failed to capture credentials:", e);
        return null;
    }
};

/**
 * Show a success banner on the page.
 */
const showSuccessBanner = (email: string) => {
    // Remove any existing banner
    const existing = document.getElementById("ente-extension-banner");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "ente-extension-banner";

    const container = document.createElement("div");
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #10B981 0%, #059669 100%);
        color: white;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 999999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;

    // Create SVG icon
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.style.flexShrink = "0";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M9 12l2 2 4-4");
    path.setAttribute("stroke", "white");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    circle.setAttribute("stroke", "white");
    circle.setAttribute("stroke-width", "2");

    svg.appendChild(path);
    svg.appendChild(circle);

    // Create message span
    const messageSpan = document.createElement("span");
    const strongText = document.createElement("strong");
    strongText.textContent = "Ente Auth Extension:";
    messageSpan.appendChild(strongText);
    messageSpan.appendChild(document.createTextNode(" Logged in as "));

    const emailSpan = document.createElement("span");
    emailSpan.textContent = email;
    messageSpan.appendChild(emailSpan);

    messageSpan.appendChild(document.createTextNode(". You can close this tab and return to the extension."));

    // Create dismiss button
    const dismissButton = document.createElement("button");
    dismissButton.textContent = "Dismiss";
    dismissButton.style.cssText = `
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        margin-left: 8px;
    `;
    dismissButton.addEventListener("click", () => banner.remove());

    container.appendChild(svg);
    container.appendChild(messageSpan);
    container.appendChild(dismissButton);
    banner.appendChild(container);
    document.body.prepend(banner);
};

/**
 * Send captured credentials to the extension background script.
 */
const sendCredentialsToExtension = async (credentials: CapturedCredentials): Promise<boolean> => {
    if (credentialsSent) {
        console.log("[Ente Extension] Credentials already sent this session");
        return false;
    }

    try {
        const response = await browser.runtime.sendMessage({
            type: "WEB_LOGIN_CREDENTIALS",
            credentials,
        }) as { success?: boolean; error?: string } | undefined;

        // Only show banner if background script confirmed success
        if (response && response.success) {
            console.log("[Ente Extension] Credentials accepted by extension");
            credentialsSent = true;
            showSuccessBanner(credentials.email);
            return true;
        } else {
            console.log("[Ente Extension] Background script rejected credentials:", response?.error);
            return false;
        }
    } catch (e) {
        console.error("[Ente Extension] Failed to send credentials:", e);
        return false;
    }
};

/**
 * Monitor for login completion.
 */
const monitorForLogin = () => {
    // Initialize lastSeenEncryptionKey with current value (if any) to detect changes
    lastSeenEncryptionKey = sessionStorage.getItem("encryptionKey");

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Cleanup function to remove all listeners and timers
    const cleanup = (intervalId: ReturnType<typeof setInterval>) => {
        clearInterval(intervalId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        window.removeEventListener("storage", handleStorageChange);
    };

    // Storage change handler (defined separately so it can be removed)
    const handleStorageChange = async (event: StorageEvent) => {
        if (credentialsSent) return;

        if (event.key === "user" || event.key === "encryptionKey") {
            const credentials = await captureCredentials();
            if (credentials) {
                await sendCredentialsToExtension(credentials);
            }
        }
    };

    // Monitor for storage changes (login completion)
    const checkInterval = setInterval(async () => {
        if (credentialsSent) {
            cleanup(checkInterval);
            return;
        }

        const credentials = await captureCredentials();
        if (credentials) {
            const success = await sendCredentialsToExtension(credentials);
            if (success) {
                cleanup(checkInterval);
            }
        }
    }, 1000);

    // Stop checking after 10 minutes
    timeoutId = setTimeout(() => cleanup(checkInterval), 10 * 60 * 1000);

    // Also listen for storage events (works for changes from other tabs/frames)
    window.addEventListener("storage", handleStorageChange);
};

// Start monitoring when the script loads
setupPasswordCapture();
monitorForLogin();

// Listen for messages from the extension
onMessage((message, _sender, sendResponse) => {
    const msg = message as { type: string };
    if (msg.type === "CHECK_LOGIN_STATUS") {
        captureCredentials(true).then((credentials) => {
            sendResponse({ loggedIn: !!credentials, credentials });
        });
        return true;
    }
});
