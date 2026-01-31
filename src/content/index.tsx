/**
 * Content script entry point.
 * Detects MFA fields and shows autofill popup.
 */
import type Browser from "webextension-polyfill";
import { browser, sendMessage } from "@shared/browser";
import type { DomainMatch, ExtensionSettings, MFAFieldDetection } from "@shared/types";
import { fillCode } from "./autofill";
import { getBestMFAField } from "./detector";
import { hidePopup, showPopup } from "./popup";
import "./styles.css";

let currentDetection: MFAFieldDetection | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let hasShownPopup = false;
let lastUrl = window.location.href;
let validationInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Reset state and hide popup when navigation occurs.
 */
const resetState = (): void => {
    hidePopup();
    hasShownPopup = false;
    currentDetection = null;
};

/**
 * Check if the current detection is still valid (element in DOM and visible).
 */
const isDetectionValid = (): boolean => {
    if (!currentDetection?.element) return false;

    const element = currentDetection.element;

    // Check if element is still in the DOM
    if (!document.body.contains(element)) return false;

    // Check if element is still visible
    if (!element.offsetParent && element.style.display !== "fixed") return false;

    return true;
};

/**
 * Send message with retry logic for MV3 service worker wake-up.
 */
async function sendMessageWithRetry<T>(
    message: Parameters<typeof sendMessage>[0],
    retries = 2
): Promise<T | null> {
    try {
        return await sendMessage<T>(message);
    } catch (error) {
        // Check if it's a connection error (service worker not ready)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("Could not establish connection") ||
            errorMessage.includes("Receiving end does not exist")) {
            if (retries > 0) {
                // Wait a bit for service worker to wake up
                await new Promise<void>(r => setTimeout(r, 100));
                return sendMessageWithRetry<T>(message, retries - 1);
            }
            // Silently fail after retries - extension might not be ready
            return null;
        }
        throw error;
    }
}

/**
 * Check for MFA fields and show popup if matches found.
 */
const checkForMFAFields = async (): Promise<void> => {
    // Don't check again if we've already shown a popup this page load
    if (hasShownPopup) return;

    // Detect MFA fields
    const detection = getBestMFAField();
    if (!detection) return;

    currentDetection = detection;

    // Get current domain
    const domain = window.location.hostname;

    try {
        // Get settings to check if autofill icon is enabled
        const settingsResponse = await sendMessageWithRetry<{
            success: boolean;
            data?: ExtensionSettings;
        }>({ type: "GET_SETTINGS" });

        const settings = settingsResponse?.data;
        if (settings && !settings.showAutofillIcon) {
            return;
        }

        // Get matching codes from background
        const response = await sendMessageWithRetry<{
            success: boolean;
            data?: { matches: DomainMatch[]; timeOffset: number };
            error?: string;
        }>({
            type: "GET_CODES_FOR_DOMAIN",
            domain,
        });

        // Show popup with matches (or empty if not logged in)
        const matches = response?.data?.matches || [];
        const timeOffset = response?.data?.timeOffset || 0;
        const autoFillSingleMatch = settings?.autoFillSingleMatch ?? true;

        // Show popup with matches (or no matches message)
        showPopup(matches, timeOffset, (otp: string) => {
            if (currentDetection) {
                fillCode(currentDetection, otp);
            }
        }, currentDetection.element, autoFillSingleMatch);
        hasShownPopup = true;
    } catch (error) {
        // Categorize errors for appropriate handling
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Silently ignore connection errors (extension not ready, service worker sleeping)
        if (errorMessage.includes("Could not establish connection") ||
            errorMessage.includes("Receiving end does not exist") ||
            errorMessage.includes("Extension context invalidated")) {
            return;
        }

        // Log actual unexpected errors
        console.error("[Ente Auth] Error checking for MFA fields:", error);
    }
};

/**
 * Debounced check for MFA fields.
 */
const debouncedCheck = (): void => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(checkForMFAFields, 500);
};

/**
 * Handle messages from the background script.
 */
const handleMessage = (
    message: unknown,
    _sender: Browser.Runtime.MessageSender,
    sendResponse: (response: unknown) => void
): boolean => {
    const msg = message as { type?: string; code?: string };
    if (msg.type === "FILL_OTP" && msg.code && currentDetection) {
        fillCode(currentDetection, msg.code);
        sendResponse({ success: true });
    }
    return false;
};

/**
 * Initialize the content script.
 */
const init = (): void => {
    console.log("Ente Auth content script initialized");

    // Listen for messages from background
    browser.runtime.onMessage.addListener(
        handleMessage as Parameters<typeof browser.runtime.onMessage.addListener>[0]
    );

    // Initial check
    debouncedCheck();

    // Watch for DOM changes that might indicate new MFA fields
    const observer = new MutationObserver((mutations) => {
        // Check if any mutations might have added input fields
        const hasRelevantChanges = mutations.some((mutation) => {
            if (mutation.type === "childList") {
                return Array.from(mutation.addedNodes).some(
                    (node) =>
                        node instanceof HTMLElement &&
                        (node.tagName === "INPUT" ||
                            node.querySelector?.("input"))
                );
            }
            return false;
        });

        if (hasRelevantChanges) {
            debouncedCheck();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // Also check on focus events (for SPAs that show forms dynamically)
    document.addEventListener(
        "focusin",
        (e) => {
            if (e.target instanceof HTMLInputElement && !hasShownPopup) {
                debouncedCheck();
            }
        },
        true
    );

    // Clean up popup when navigating away
    window.addEventListener("beforeunload", () => {
        hidePopup();
    });

    // Handle SPA navigation via browser back/forward buttons
    window.addEventListener("popstate", () => {
        resetState();
        debouncedCheck();
    });

    // Start validation interval to detect URL changes and element removal
    // This catches SPA navigation via pushState/replaceState and dynamic DOM changes
    if (validationInterval) {
        clearInterval(validationInterval);
    }
    validationInterval = setInterval(() => {
        const currentUrl = window.location.href;

        // Check if URL changed (SPA navigation)
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            resetState();
            debouncedCheck();
            return;
        }

        // Check if the detected element is still valid
        if (hasShownPopup && !isDetectionValid()) {
            resetState();
            debouncedCheck();
        }
    }, 500);
};

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
