/**
 * Auto-fill functionality for MFA codes.
 */
import type { MFAFieldDetection } from "@shared/types";

/**
 * Fill an MFA code into the detected field(s) and optionally submit.
 */
export const fillCode = (detection: MFAFieldDetection, code: string, autoSubmit = true): void => {
    if (detection.type === "split" && detection.splitInputs) {
        fillSplitInputs(detection.splitInputs, code);
    } else {
        fillSingleInput(detection.element, code);
    }

    // Auto-submit after a short delay to let frameworks process the input
    if (autoSubmit) {
        setTimeout(() => {
            clickSubmitButton(detection.element);
        }, 100);
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
