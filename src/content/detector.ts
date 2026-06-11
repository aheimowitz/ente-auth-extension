/**
 * MFA field detection algorithm.
 * Detects input fields likely asking for MFA codes.
 */
import type { MFAFieldDetection } from "@shared/types";

/**
 * Attribute patterns that suggest MFA input (used in name/id/class).
 * These are typically code-level identifiers, so mostly English.
 * Note: Generic terms like "code" are excluded to avoid false positives.
 */
const MFA_ATTRIBUTE_PATTERNS = [
    "otp",
    "totp",
    "hotp",
    "mfa",
    "2fa",
    "twofa",
    "two-factor",
    "twofactor",
    "verification-code",
    "verificationcode",
    "verify-code",
    "verifycode",
    "auth-code",
    "authcode",
    // Specific *-token combinations only; bare "token" matches too many things
    // (personal access tokens, API tokens, bearer tokens, CSRF tokens, etc.)
    "auth-token",
    "authtoken",
    "2fa-token",
    "mfa-token",
    "otp-token",
    "totp-token",
    "twofa-token",
    "twofactor-token",
    "two-factor-token",
    "authenticator",
    "security-code",
    "securitycode",
    "pin-code",
    "pincode",
    "passcode",
    "one-time",
    "onetime",
    "otc",
    "fudis",
];

/**
 * Patterns that indicate the field is NOT for MFA (promo codes, etc.).
 * These take priority over MFA patterns.
 */
const EXCLUSION_PATTERNS = [
    "promo",
    "promotion",
    "promotional",
    "coupon",
    "discount",
    "voucher",
    "gift",
    "giftcard",
    "gift-card",
    "referral",
    "refer",
    "invite",
    "invitation",
    "redeem",
    "reward",
    "loyalty",
    "offer",
    "deal",
    "signup",
    "sign-up",
    "newsletter",
    "subscribe",
    "captcha",
    "recaptcha",
    "postal",
    "zip",
    "zipcode",
    "zip-code",
    "phone",
    "mobile",
    "sms",
    "sms-code",
    "smscode",
    "text-code",
    "textcode",
    "text-message",
    "textmessage",
    "phone-code",
    "phonecode",
    "phone-otp",
    "phoneotp",
    "phone-verification",
    "phone-verify",
    "email-code",
    "emailcode",
    "email-otp",
    "emailotp",
    "email-verification",
    "email-verify",
    "magic-link",
    "magiclink",
    "by-sms",
    "by-text",
    "by-email",
    "via-sms",
    "via-text",
    "via-email",
    "sms-marketing",
    // Developer/API credentials that look superficially like MFA inputs
    // (e.g. GitHub Personal Access Token displayed in a text field).
    "personal-access-token",
    "personalaccesstoken",
    "personal access token",
    "access-token",
    "accesstoken",
    "access token",
    "api-token",
    "apitoken",
    "api token",
    "api-key",
    "apikey",
    "api key",
    "bearer-token",
    "bearertoken",
    "bearer token",
    "refresh-token",
    "refreshtoken",
    "refresh token",
    "oauth-token",
    "oauthtoken",
    "oauth token",
    "secret-key",
    "secretkey",
    "secret key",
    "private-key",
    "privatekey",
    "private key",
    "deploy-key",
    "deploy key",
    "client-secret",
    "client secret",
    "client-id",
    "client id",
    "webhook-secret",
    "webhook secret",
];

/**
 * Label/placeholder/nearby-text patterns that indicate the code is delivered
 * out-of-band (SMS/email/voice) rather than from a TOTP authenticator app.
 * Checked against labels, placeholders, aria-labels and nearby container text.
 */
const OOB_LABEL_PATTERNS = [
    // English
    "text message",
    "sms",
    "via text",
    "via sms",
    "by text",
    "by sms",
    "by email",
    "via email",
    "by phone",
    "via phone",
    "text you",
    "texted you",
    "texted to",
    "text to",
    "sent to your phone",
    "sent to your mobile",
    "sent to your email",
    "sent you a text",
    "sent you an email",
    "sent you an sms",
    "check your phone",
    "check your text",
    "check your email",
    "check your inbox",
    "code we sent",
    "code sent to",
    "code we emailed",
    "code we texted",
    "we just sent",
    "we've sent",
    "we have sent",
    "we'll text",
    "we will text",
    "we'll email",
    "we will email",
    "phone number ending",
    "ending in",

    // Spanish
    "mensaje de texto",
    "te enviamos un sms",
    "código enviado",
    "enviado a tu correo",
    "enviado a tu teléfono",

    // French
    "message texte",
    "par sms",
    "par e-mail",
    "envoyé à votre",

    // German
    "per sms",
    "per e-mail",
    "an ihre telefonnummer",
    "an ihre e-mail",

    // Italian
    "messaggio di testo",
    "via sms",
    "via e-mail",
    "inviato al tuo",
];

/**
 * Label/placeholder patterns that suggest MFA input.
 * Includes translations for common languages.
 * Note: Patterns should be specific to MFA, not generic "code" matches.
 */
const MFA_LABEL_PATTERNS = [
    // English - specific MFA terms
    "verification code",
    "authentication code",
    "security code",
    "2-factor",
    "two-factor",
    "6-digit code",
    "6 digit code",
    "one-time code",
    "one time code",
    "one-time password",
    "one time password",
    "otp",
    "mfa",
    "authenticator",
    "enter your code",
    "enter the code from",
    "passcode",
    "login code",
    "signin code",
    "sign-in code",

    // Italian
    "codice di verifica",
    "codice di autenticazione",
    "codice di sicurezza",
    "codice otp",
    "inserisci il codice",
    "inserisci codice",
    "codice a 6 cifre",
    "codice monouso",

    // Spanish
    "código de verificación",
    "código de autenticación",
    "código de seguridad",
    "introduce el código",
    "ingrese el código",
    "ingresa el código",
    "código de 6 dígitos",
    "código único",

    // French
    "code de vérification",
    "code d'authentification",
    "code de sécurité",
    "entrez le code",
    "saisissez le code",
    "code à 6 chiffres",
    "code à usage unique",

    // German
    "bestätigungscode",
    "verifizierungscode",
    "authentifizierungscode",
    "sicherheitscode",
    "code eingeben",
    "6-stelliger code",
    "einmalcode",

    // Portuguese
    "código de verificação",
    "código de autenticação",
    "código de segurança",
    "digite o código",
    "insira o código",
    "código de 6 dígitos",
    "código único",

    // Dutch
    "verificatiecode",
    "beveiligingscode",
    "voer code in",

    // Polish
    "kod weryfikacyjny",
    "kod bezpieczeństwa",
    "wprowadź kod",

    // Russian (transliterated patterns that might appear in code)
    "код подтверждения",
    "код верификации",
    "введите код",

    // Japanese (common patterns)
    "認証コード",
    "確認コード",
    "ワンタイム",

    // Chinese (common patterns)
    "验证码",
    "認證碼",
    "安全码",
    "动态口令",
    "动态码",
    "动态验证码",
    "两步验证",
    "身份验证码",
    "mfa码",

    // Korean (common patterns)
    "인증 코드",
    "인증코드",
    "보안 코드",
    "일회용 비밀번호",
];

/**
 * Check if a string matches any MFA pattern.
 */
const matchesPattern = (value: string | null, patterns: string[]): boolean => {
    if (!value) return false;
    const lower = value.toLowerCase();
    return patterns.some((pattern) => lower.includes(pattern));
};

/**
 * Return true if this input is clearly NOT a TOTP field: a non-MFA code (promo,
 * captcha, postal...), or an out-of-band code (SMS / email / voice) that the
 * user receives elsewhere and types in manually.
 *
 * Used as an early-exit for both single-input and split-input detection so SMS
 * 6-box UIs don't trigger the autofill icon.
 */
const isExcludedField = (input: HTMLInputElement): boolean => {
    const dataAttrsText = Array.from(input.attributes)
        .filter(attr => attr.name.startsWith("data-"))
        .map(attr => `${attr.name} ${attr.value}`)
        .join(" ");

    const inputText = [
        input.name,
        input.id,
        input.className,
        input.placeholder,
        input.getAttribute("aria-label"),
        dataAttrsText,
    ].filter(Boolean).join(" ");

    if (matchesPattern(inputText, EXCLUSION_PATTERNS)) return true;

    const inputLabel = findLabelForInput(input);
    if (inputLabel && matchesPattern(inputLabel.textContent, EXCLUSION_PATTERNS)) return true;

    const inputContainer = input.closest("form, fieldset, [role='group']") || input.parentElement?.parentElement;
    if (inputContainer) {
        const containerText = `${(inputContainer as HTMLElement).id || ""} ${(inputContainer as HTMLElement).className || ""}`;
        if (matchesPattern(containerText, EXCLUSION_PATTERNS)) return true;
    }

    // Out-of-band delivery hints (SMS / email / voice)
    const placeholder = input.placeholder || "";
    const ariaLabel = input.getAttribute("aria-label") || "";
    const labelText = inputLabel?.textContent || "";
    if (
        matchesPattern(placeholder, OOB_LABEL_PATTERNS) ||
        matchesPattern(ariaLabel, OOB_LABEL_PATTERNS) ||
        matchesPattern(labelText, OOB_LABEL_PATTERNS)
    ) {
        return true;
    }

    const oobDescribedById = input.getAttribute("aria-describedby");
    if (oobDescribedById) {
        const describedBy = document.getElementById(oobDescribedById);
        if (describedBy && matchesPattern(describedBy.textContent, OOB_LABEL_PATTERNS)) {
            return true;
        }
    }

    // Walk up a few levels of ancestors looking for OOB hints in nearby text.
    // Skipped when autocomplete="one-time-code" is set: that attribute is the
    // HTML standard signal of developer intent for an OTP field, and the broad
    // ancestor scan false-positives on legitimate TOTP forms that mention SMS
    // or email anywhere in nearby boilerplate (backup options, help links,
    // footer copy). Precise signals above still apply.
    if (input.autocomplete !== "one-time-code") {
        let oobAncestor: HTMLElement | null = input.parentElement;
        for (let depth = 0; depth < 4 && oobAncestor && oobAncestor !== document.body; depth++) {
            const nearbyText = oobAncestor.textContent || "";
            if (matchesPattern(nearbyText.slice(0, 500), OOB_LABEL_PATTERNS)) {
                return true;
            }
            oobAncestor = oobAncestor.parentElement;
        }
    }

    return false;
};

/**
 * Calculate confidence score for a single input element.
 * Prioritizes language-agnostic signals (HTML attributes) over text patterns.
 */
const calculateConfidence = (input: HTMLInputElement): number => {
    if (isExcludedField(input)) return 0;

    let confidence = 0;

    // === HIGH CONFIDENCE: Language-agnostic HTML attributes ===

    // autocomplete="one-time-code" is the standard way to mark OTP fields
    if (input.autocomplete === "one-time-code") {
        confidence += 0.7;
    }

    // inputmode="numeric" + maxlength="6" is a very strong signal
    if (input.inputMode === "numeric" && input.maxLength === 6) {
        confidence += 0.5;
    }

    // Pattern attribute for 6 digits
    const pattern = input.pattern;
    if (pattern && (/\[0-9\]\{6\}/.test(pattern) || /\\d\{6\}/.test(pattern) || /^\d{6}$/.test(pattern))) {
        confidence += 0.4;
    }

    // maxlength of 6 alone is a moderate signal
    if (input.maxLength === 6) {
        confidence += 0.2;
    }

    // maxlength of 4 or 8 (some services use these)
    if (input.maxLength === 4 || input.maxLength === 8) {
        confidence += 0.1;
    }

    // inputmode="numeric" alone
    if (input.inputMode === "numeric" && input.maxLength !== 6) {
        confidence += 0.15;
    }

    // type="tel" or type="number" (common for numeric codes)
    if (input.type === "tel" || input.type === "number") {
        confidence += 0.15;
    }

    // === MEDIUM CONFIDENCE: Code-level identifiers (usually English) ===

    // Check name/id/class attributes
    const nameIdClass = `${input.name || ""} ${input.id || ""} ${input.className || ""}`;
    if (matchesPattern(nameIdClass, MFA_ATTRIBUTE_PATTERNS)) {
        confidence += 0.3;
    }

    // Check data-* attributes
    const dataAttrs = Array.from(input.attributes)
        .filter(attr => attr.name.startsWith("data-"))
        .map(attr => `${attr.name} ${attr.value}`)
        .join(" ");
    if (matchesPattern(dataAttrs, MFA_ATTRIBUTE_PATTERNS)) {
        confidence += 0.2;
    }

    // === LOWER CONFIDENCE: Text content (language-dependent) ===

    // Check placeholder
    if (matchesPattern(input.placeholder, MFA_LABEL_PATTERNS)) {
        confidence += 0.25;
    }

    // Check for associated label
    const label = findLabelForInput(input);
    if (label && matchesPattern(label.textContent, MFA_LABEL_PATTERNS)) {
        confidence += 0.25;
    }

    // Check aria-label
    if (matchesPattern(input.getAttribute("aria-label"), MFA_LABEL_PATTERNS)) {
        confidence += 0.2;
    }

    // Check aria-describedby text
    const describedById = input.getAttribute("aria-describedby");
    if (describedById) {
        const describedBy = document.getElementById(describedById);
        if (describedBy && matchesPattern(describedBy.textContent, MFA_LABEL_PATTERNS)) {
            confidence += 0.15;
        }
    }

    // Check nearby text (within parent or form)
    const container = input.closest("form, fieldset, [role='group']") || input.parentElement?.parentElement;
    if (container) {
        // Check class/id of container
        const containerIdClass = `${container.id || ""} ${container.className || ""}`;
        if (matchesPattern(containerIdClass, MFA_ATTRIBUTE_PATTERNS)) {
            confidence += 0.2;
        }
    }

    // Check ancestor tag names and class/id (catches custom elements like
    // <app-two-factor-auth> and wrapper divs like <div class="mfa-input">)
    let ancestor: HTMLElement | null = input.parentElement;
    while (ancestor && ancestor !== document.body) {
        // Skip the container already checked above to avoid double-counting
        if (ancestor === container) {
            ancestor = ancestor.parentElement;
            continue;
        }
        const tagName = ancestor.tagName.toLowerCase();
        const ancestorIdClass = `${ancestor.id || ""} ${ancestor.className || ""}`;
        if (matchesPattern(tagName, MFA_ATTRIBUTE_PATTERNS) || matchesPattern(ancestorIdClass, MFA_ATTRIBUTE_PATTERNS)) {
            confidence += 0.2;
            break;
        }
        ancestor = ancestor.parentElement;
    }

    return Math.min(confidence, 1);
};

/**
 * Find the label element for an input.
 */
const findLabelForInput = (input: HTMLInputElement): HTMLLabelElement | null => {
    // Check for explicit label via for attribute
    if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return label as HTMLLabelElement;
    }

    // Check for parent label
    const parentLabel = input.closest("label");
    if (parentLabel) return parentLabel as HTMLLabelElement;

    return null;
};

/**
 * Find the lowest common ancestor of two DOM elements within a reasonable depth.
 */
const findCommonAncestor = (a: HTMLElement, b: HTMLElement, maxDepth = 6): HTMLElement | null => {
    const ancestors = new Set<HTMLElement>();
    let node: HTMLElement | null = a;
    for (let i = 0; i < maxDepth && node; i++) {
        ancestors.add(node);
        node = node.parentElement;
    }
    node = b;
    for (let i = 0; i < maxDepth && node; i++) {
        if (ancestors.has(node)) return node;
        node = node.parentElement;
    }
    return null;
};

/**
 * Check if two inputs are visually adjacent (on the same horizontal row and
 * close together). This handles deeply nested DOM structures where structural
 * checks (sibling/parent) fail.
 */
const areVisuallyAdjacent = (a: HTMLInputElement, b: HTMLInputElement): boolean => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();

    // Must be on roughly the same vertical line (within 20px tolerance)
    if (Math.abs(rectA.top - rectB.top) > 20) return false;

    // Horizontal gap should be reasonable (less than 80px apart)
    const gap = rectB.left - (rectA.left + rectA.width);
    if (gap < -5 || gap > 80) return false;

    return true;
};

/**
 * Detect split OTP inputs (6 adjacent single-character inputs).
 * Uses a combination of DOM structure and visual position to handle
 * deeply-nested wrappers common in modern frameworks.
 */
const detectSplitInputs = (): MFAFieldDetection | null => {
    // Broader selector: also match inputs without maxlength that are very
    // narrow (styled to accept a single character), or inputs with size="1"
    const allInputs = document.querySelectorAll<HTMLInputElement>(
        'input[maxlength="1"][type="text"], input[maxlength="1"][type="tel"], input[maxlength="1"][type="number"], input[maxlength="1"]:not([type]), input[maxlength="2"][type="text"], input[maxlength="2"][type="tel"], input[maxlength="2"]:not([type])'
    );

    // Collect visible, interactive single-char inputs
    const candidates: HTMLInputElement[] = [];
    allInputs.forEach((input) => {
        if (!input.offsetParent) return; // Skip hidden inputs
        if (input.readOnly || input.disabled) return;
        // For maxlength="2" inputs, also check if they're narrow (< 50px)
        // which suggests they're single-digit OTP boxes
        if (input.maxLength === 2) {
            const rect = input.getBoundingClientRect();
            if (rect.width > 50) return;
        }
        candidates.push(input);
    });

    // Find groups of 4-8 adjacent inputs using both DOM and visual proximity
    const groups: HTMLInputElement[][] = [];
    let currentGroup: HTMLInputElement[] = [];

    for (let i = 0; i < candidates.length; i++) {
        const input = candidates[i]!;

        if (currentGroup.length === 0) {
            currentGroup.push(input);
            continue;
        }

        const lastInput = currentGroup[currentGroup.length - 1]!;

        // Check structural proximity (DOM-based)
        const isSibling =
            lastInput.nextElementSibling === input ||
            lastInput.parentElement === input.parentElement;
        const hasCommonAncestor = findCommonAncestor(lastInput, input, 6) !== null;

        // Check visual proximity (position-based)
        const isVisuallyClose = areVisuallyAdjacent(lastInput, input);

        if (isSibling || (hasCommonAncestor && isVisuallyClose) || isVisuallyClose) {
            currentGroup.push(input);
        } else {
            if (currentGroup.length >= 4 && currentGroup.length <= 8) {
                groups.push(currentGroup);
            }
            currentGroup = [input];
        }
    }

    if (currentGroup.length >= 4 && currentGroup.length <= 8) {
        groups.push(currentGroup);
    }

    // Prefer groups of exactly 6 (most common OTP length), then 4, then others
    groups.sort((a, b) => {
        const preferredA = a.length === 6 ? 0 : a.length === 4 ? 1 : 2;
        const preferredB = b.length === 6 ? 0 : b.length === 4 ? 1 : 2;
        return preferredA - preferredB;
    });

    // Return the first valid group that isn't excluded (SMS / email / promo).
    for (const group of groups) {
        if (!isExcludedField(group[0]!)) {
            return {
                element: group[0]!,
                confidence: 0.85,
                type: "split",
                splitInputs: group,
            };
        }
    }

    return null;
};

/**
 * Detect all MFA fields on the page.
 */
export const detectMFAFields = (): MFAFieldDetection[] => {
    const detections: MFAFieldDetection[] = [];

    // First, check for split inputs
    const splitDetection = detectSplitInputs();
    if (splitDetection) {
        detections.push(splitDetection);
    }

    // Then check single inputs
    const inputs = document.querySelectorAll<HTMLInputElement>(
        'input[type="text"], input[type="tel"], input[type="number"], input:not([type])'
    );

    inputs.forEach((input) => {
        // Skip hidden inputs
        if (!input.offsetParent) return;

        // Skip readonly/disabled — these are display fields (e.g. a generated
        // GitHub PAT shown back to the user), not MFA prompts.
        if (input.readOnly || input.disabled) return;

        // Skip if already part of a split detection
        if (splitDetection?.splitInputs?.includes(input)) return;

        // Skip password fields
        if (input.type === "password") return;

        const confidence = calculateConfidence(input);
        if (confidence >= 0.3) {
            detections.push({
                element: input,
                confidence,
                type: "single",
            });
        }
    });

    // Sort by confidence
    detections.sort((a, b) => b.confidence - a.confidence);

    return detections;
};

/**
 * Check if the page likely has an MFA prompt.
 */
export const hasMFAPrompt = (): boolean => {
    const detections = detectMFAFields();
    return detections.some((d) => d.confidence >= 0.5);
};

/**
 * Get the best MFA field detection.
 */
export const getBestMFAField = (): MFAFieldDetection | null => {
    const detections = detectMFAFields();
    const best = detections.find((d) => d.confidence >= 0.5);
    return best || null;
};
