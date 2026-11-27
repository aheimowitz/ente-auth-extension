/**
 * Auto-fill functionality for MFA codes.
 */
import type { MFAFieldDetection } from "@shared/types";

/**
 * Maximum number of automatic (non-user-initiated) submit attempts per page
 * path. Prevents a failing submission that reloads the page from looping and
 * tripping site rate limits / anti-bot checks.
 */
const MAX_AUTO_SUBMIT_ATTEMPTS = 2;

/**
 * SessionStorage key for tracking auto-submit attempts on the current page.
 */
const SUBMIT_ATTEMPTS_KEY = "ente_auth_submit_attempts";

/**
 * Get the number of auto-submit attempts recorded for the current page path.
 */
const getSubmitAttempts = (): number => {
    try {
        const data = sessionStorage.getItem(SUBMIT_ATTEMPTS_KEY);
        if (!data) return 0;
        const parsed = JSON.parse(data) as { path?: string; count?: number };
        return parsed.path === window.location.pathname ? parsed.count || 0 : 0;
    } catch {
        return 0;
    }
};

/**
 * Increment the auto-submit attempt counter for the current page path.
 */
const incrementSubmitAttempts = (): void => {
    try {
        sessionStorage.setItem(
            SUBMIT_ATTEMPTS_KEY,
            JSON.stringify({
                path: window.location.pathname,
                count: getSubmitAttempts() + 1,
            })
        );
    } catch {
        // Ignore storage errors (e.g. sandboxed iframes)
    }
};

/**
 * Automatic (non-user-initiated) fills allowed per site within
 * AUTO_FILL_WINDOW_MS. When the detector picks the wrong field (e.g. an email
 * or SMS-code input), the page often clears or re-renders it, which makes the
 * extension detect it again and refill it forever. Past this limit the icon
 * still shows, but filling needs a click (issue #76).
 */
const MAX_AUTO_FILLS_PER_WINDOW = 2;
const AUTO_FILL_WINDOW_MS = 60_000;

/**
 * SessionStorage key for timestamps of recent automatic fills. sessionStorage
 * is per-origin and per-tab and survives reloads, so attempts that reload the
 * page are still counted.
 */
const AUTO_FILL_ATTEMPTS_KEY = "ente_auth_auto_fill_attempts";

// Used when sessionStorage is unavailable, so the limit still applies until reload
let inMemoryAutoFills: number[] = [];

const getRecentAutoFills = (): number[] => {
    const cutoff = Date.now() - AUTO_FILL_WINDOW_MS;
    let stored: unknown = inMemoryAutoFills;
    try {
        const data = sessionStorage.getItem(AUTO_FILL_ATTEMPTS_KEY);
        if (data) stored = JSON.parse(data);
    } catch {
        // Fall back to the in-memory list
    }
    if (!Array.isArray(stored)) return [];
    return stored.filter((t): t is number => typeof t === "number" && t > cutoff);
};

/**
 * Whether another automatic fill is allowed on this site right now.
 */
export const canAutoFill = (): boolean =>
    getRecentAutoFills().length < MAX_AUTO_FILLS_PER_WINDOW;

/**
 * Record an automatic fill. Returns false (and records nothing) if the limit
 * is already reached, in which case the caller should not fill.
 */
export const recordAutoFill = (): boolean => {
    const recent = getRecentAutoFills();
    if (recent.length >= MAX_AUTO_FILLS_PER_WINDOW) {
        console.log("[Ente Auth] Auto-fill paused: too many automatic fills on this site");
        return false;
    }
    const updated = [...recent, Date.now()];
    inMemoryAutoFills = updated;
    try {
        sessionStorage.setItem(AUTO_FILL_ATTEMPTS_KEY, JSON.stringify(updated));
    } catch {
        // Storage unavailable (e.g. sandboxed iframe): the in-memory list applies
    }
    return true;
};

/**
 * Fill an MFA code into the detected field(s) and optionally submit.
 * Only submits if autoSubmit is explicitly enabled.
 * Non-user-initiated fills are capped at MAX_AUTO_SUBMIT_ATTEMPTS.
 */
export const fillCode = (
    detection: MFAFieldDetection,
    code: string,
    autoSubmit: boolean,
    userInitiated = true
): void => {
    if (detection.type === "split" && detection.splitInputs) {
        fillSplitInputs(detection.splitInputs, code);
    } else {
        fillSingleInput(detection.element, code);
    }

    // Auto-submit if autoSubmit is enabled, after a short delay to let frameworks process the input
    if (autoSubmit) {
        if (userInitiated || getSubmitAttempts() < MAX_AUTO_SUBMIT_ATTEMPTS) {
            incrementSubmitAttempts();
            setTimeout(() => {
                clickSubmitButton(detection.element);
            }, 100);
        } else {
            console.log("[Ente Auth] Auto-submit skipped: max attempts reached for this page");
        }
    }
};

/**
 * Fill a single input field.
 */
const fillSingleInput = (input: HTMLInputElement, code: string): void => {
    // Focus the input
    input.focus();

    // Set the value
    input.value = code;

    // Trigger input events to notify frameworks
    triggerInputEvents(input);
};

/**
 * Fill split inputs (one character per field).
 */
const fillSplitInputs = (inputs: HTMLInputElement[], code: string): void => {
    const digits = code.split("");

    inputs.forEach((input, index) => {
        if (index < digits.length) {
            input.focus();
            input.value = digits[index]!;
            triggerInputEvents(input);
        }
    });

    // Focus the last filled input
    if (inputs.length > 0) {
        const lastIndex = Math.min(digits.length - 1, inputs.length - 1);
        inputs[lastIndex]?.focus();
    }
};

/**
 * Trigger input events to notify frameworks (React, Vue, Angular, etc.).
 */
const triggerInputEvents = (input: HTMLInputElement): void => {
    // Create and dispatch events
    const inputEvent = new Event("input", { bubbles: true, cancelable: true });
    const changeEvent = new Event("change", { bubbles: true, cancelable: true });

    // For React synthetic events
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    )?.set;

    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, input.value);
    }

    input.dispatchEvent(inputEvent);
    input.dispatchEvent(changeEvent);

    // Also trigger keydown/keyup for some frameworks
    input.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true })
    );
    input.dispatchEvent(
        new KeyboardEvent("keyup", { bubbles: true, cancelable: true })
    );
};

/**
 * Clear an MFA field.
 */
export const clearField = (detection: MFAFieldDetection): void => {
    if (detection.type === "split" && detection.splitInputs) {
        detection.splitInputs.forEach((input) => {
            input.value = "";
            triggerInputEvents(input);
        });
    } else {
        detection.element.value = "";
        triggerInputEvents(detection.element);
    }
};

/**
 * Check if an element looks like a submit button based on text/attributes.
 */
const isLikelySubmitButton = (element: HTMLElement): boolean => {
    const text = element.textContent?.toLowerCase().trim() || "";
    const ariaLabel = element.getAttribute("aria-label")?.toLowerCase() || "";
    const title = element.getAttribute("title")?.toLowerCase() || "";
    const className = element.className?.toLowerCase() || "";
    const id = element.id?.toLowerCase() || "";

    // Common submit button keywords
    const submitKeywords = [
        "submit", "verify", "confirm", "continue", "next",
        "sign in", "signin", "login", "log in", "authenticate",
        "send", "done", "ok", "go", "enter",
        // Chinese
        "验证", "确认", "提交", "继续", "登录", "登入", "下一步",
        // Japanese
        "確認", "送信", "ログイン", "次へ",
        // Korean
        "확인", "제출", "로그인", "다음",
    ];

    // Check text content, aria-label, and title
    for (const keyword of submitKeywords) {
        if (text.includes(keyword) || ariaLabel.includes(keyword) || title.includes(keyword)) {
            return true;
        }
    }

    // Check for primary/submit button classes
    const primaryClassPatterns = [
        "submit", "primary", "btn-primary", "cta", "action",
        "continue", "next", "confirm"
    ];
    for (const pattern of primaryClassPatterns) {
        if (className.includes(pattern) || id.includes(pattern)) {
            return true;
        }
    }

    return false;
};

/**
 * Find and click the submit button associated with an MFA input.
 */
const clickSubmitButton = (input: HTMLInputElement): void => {
    // Strategy 1: Find submit button in the same form
    const form = input.closest("form");
    if (form) {
        // First try explicit submit buttons
        const submitButton = form.querySelector<HTMLButtonElement | HTMLInputElement>(
            'button[type="submit"], input[type="submit"]'
        );
        if (submitButton && !submitButton.disabled) {
            console.log("[Ente Auth] Clicking submit button in form");
            submitButton.click();
            return;
        }

        // Then try buttons without type (default to submit in forms)
        const defaultButton = form.querySelector<HTMLButtonElement>('button:not([type])');
        if (defaultButton && !defaultButton.disabled) {
            console.log("[Ente Auth] Clicking default button in form");
            defaultButton.click();
            return;
        }

        // Check all buttons in form for submit-like text
        const formButtons = form.querySelectorAll<HTMLButtonElement>("button");
        for (const button of formButtons) {
            if (!button.disabled && isLikelySubmitButton(button)) {
                console.log("[Ente Auth] Clicking likely submit button in form:", button.textContent?.trim());
                button.click();
                return;
            }
        }
    }

    // Strategy 2: Walk up the DOM to find buttons in parent containers
    let container: HTMLElement | null = input.parentElement;
    const checkedContainers = new Set<HTMLElement>();

    // Walk up to 10 levels looking for buttons
    for (let i = 0; i < 10 && container; i++) {
        if (checkedContainers.has(container)) {
            container = container.parentElement;
            continue;
        }
        checkedContainers.add(container);

        // Look for buttons and button-like elements
        const clickables = container.querySelectorAll<HTMLElement>(
            'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'
        );

        for (const element of clickables) {
            // Skip disabled elements
            if (element.hasAttribute("disabled") ||
                element.getAttribute("aria-disabled") === "true") {
                continue;
            }

            if (isLikelySubmitButton(element)) {
                console.log("[Ente Auth] Clicking button:", element.textContent?.trim());
                element.click();
                return;
            }
        }

        container = container.parentElement;
    }

    // Strategy 3: Look for any visible primary-looking button on the page
    const allButtons = document.querySelectorAll<HTMLElement>(
        'button, input[type="submit"], a[role="button"], [role="button"]'
    );

    for (const button of allButtons) {
        // Skip hidden or disabled buttons
        if (button.hasAttribute("disabled") ||
            button.getAttribute("aria-disabled") === "true" ||
            button.offsetParent === null) {
            continue;
        }

        if (isLikelySubmitButton(button)) {
            // Make sure it's visible in the viewport
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                console.log("[Ente Auth] Clicking visible submit button:", button.textContent?.trim());
                button.click();
                return;
            }
        }
    }

    // Strategy 4: Submit the form directly if we found one
    if (form) {
        console.log("[Ente Auth] Submitting form directly");
        form.requestSubmit();
        return;
    }

    console.log("[Ente Auth] No submit button found");
};
