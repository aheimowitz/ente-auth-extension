/**
 * Notice when detection probably went wrong, and offer to report it:
 *
 * - "missed-field": the user entered a code in a field Duckey didn't pick.
 *   With the vault unlocked, a pasted or typed value only counts if it is one
 *   of the user's own current codes (checked by the background script, on the
 *   device; the page only learns yes or no). With the
 *   vault locked that can't be checked, so only a paste into a field that
 *   looks like a code field counts.
 * - "wrong-field": Duckey filled a code, and the user then typed something
 *   that isn't a code (letters, an email) into that same field.
 *
 * Only real user input counts (event.isTrusted), so Duckey's own fills never
 * trigger it. Nothing is sent anywhere: the user is shown a prompt and decides
 * whether to open the report page. The background limits how often prompts
 * appear (per site and per day; see background/report-suggestions.ts), and the
 * "Suggest reporting detection problems" setting turns them off.
 */
import { sendMessage } from "@shared/browser";
import type { DetectionProblem, MFAFieldDetection } from "@shared/types";
import { diagnoseField } from "./detector";
import { showReportSuggestion } from "./popup";
import { canSuggestReport, claimReportSuggestion } from "./reportSuggestions";

/** How long after Duckey fills a field a non-code entry there counts as "wrong field" */
const WRONG_FIELD_WINDOW_MS = 2 * 60_000;

/** Digits only, 6–8 long, once spaces and dashes are removed */
const asCode = (value: string): string | null => {
    const digits = value.replace(/[\s-]/g, "");
    return /^\d{6,8}$/.test(digits) ? digits : null;
};

/** Text that is clearly not a code: has a letter or an @ */
const isClearlyNotACode = (value: string): boolean => /[a-z@]/i.test(value);

/** The field a prompt is about, for the report page */
let suggestionTarget: HTMLInputElement | null = null;
export const getSuggestionTarget = (): HTMLInputElement | null =>
    suggestionTarget?.isConnected ? suggestionTarget : null;

/** The last field Duckey filled, for "wrong-field" */
let lastFill: { element: HTMLInputElement; at: number } | null = null;

/** The last value checked per field, so typing doesn't recheck the same code */
const lastChecked = new WeakMap<HTMLInputElement, string>();

let getDetection: () => MFAFieldDetection | null = () => null;

const isDetectedField = (input: HTMLInputElement): boolean => {
    const detection = getDetection();
    return !!detection && (detection.element === input || !!detection.splitInputs?.includes(input));
};

const suggest = async (input: HTMLInputElement, problem: DetectionProblem): Promise<void> => {
    if (!input.isConnected || !(await claimReportSuggestion())) return;
    suggestionTarget = input;
    showReportSuggestion(input, problem);
};

/**
 * Whether the value is one of the user's codes right now. The background
 * checks and answers only yes / no, or null when the vault is locked or
 * logged out; the codes themselves never reach the page.
 */
const matchesOwnCode = async (value: string): Promise<boolean | null> => {
    try {
        const res = await sendMessage<{ success: boolean; data?: { matched: boolean | null } }>({
            type: "IS_OWN_CODE",
            value,
        });
        return res?.success && res.data ? res.data.matched : null;
    } catch {
        return null;
    }
};

/** Signals that a field is meant for a short code, used when codes can't be checked */
const looksLikeCodeField = (input: HTMLInputElement): boolean => {
    const diagnosis = diagnoseField(input);
    // An SMS / email code field Duckey skipped on purpose isn't a miss
    if (diagnosis.excluded) return false;
    return (
        input.autocomplete === "one-time-code" ||
        input.inputMode === "numeric" ||
        (input.maxLength >= 6 && input.maxLength <= 8) ||
        diagnosis.confidence >= 0.2
    );
};

const checkForMissedField = async (input: HTMLInputElement, value: string, pasted: boolean): Promise<void> => {
    if (isDetectedField(input)) return;
    const code = asCode(value);
    if (!code || lastChecked.get(input) === code) return;
    lastChecked.set(input, code);
    // Don't check codes at all when the setting is off or this site can't be asked
    if (!(await canSuggestReport())) return;

    const matched = await matchesOwnCode(code);
    // Unlocked: only the user's own codes count; any other code is likely
    // from SMS or email. Locked: fall back to a paste into a code-like field.
    const isMiss = matched ?? (pasted && looksLikeCodeField(input));
    if (isMiss && !isDetectedField(input)) await suggest(input, "missed-field");
};

const checkForWrongField = (input: HTMLInputElement): void => {
    if (!lastFill || lastFill.element !== input) return;
    if (Date.now() - lastFill.at > WRONG_FIELD_WINDOW_MS) {
        lastFill = null;
        return;
    }
    if (isClearlyNotACode(input.value)) {
        lastFill = null;
        void suggest(input, "wrong-field");
    }
};

const inputFromEvent = (e: Event): HTMLInputElement | null => {
    // composedPath() reaches inputs inside open shadow roots
    const target = e.composedPath()[0];
    return target instanceof HTMLInputElement ? target : null;
};

/**
 * Record that Duckey filled a field, so a non-code entry there soon after can
 * be flagged as a wrong pick. Split fields are skipped: one box can't hold an
 * email or other text.
 */
export const noteDuckeyFill = (detection: MFAFieldDetection): void => {
    lastFill = detection.type === "split" ? null : { element: detection.element, at: Date.now() };
};

/**
 * Start listening. getCurrentDetection returns the field Duckey currently
 * attaches to, if any.
 */
export const startMissDetection = (getCurrentDetection: () => MFAFieldDetection | null): void => {
    getDetection = getCurrentDetection;

    document.addEventListener(
        "paste",
        (e) => {
            if (!e.isTrusted) return;
            const input = inputFromEvent(e);
            const text = e.clipboardData?.getData("text") ?? "";
            if (input && text) void checkForMissedField(input, text, true);
        },
        true
    );

    document.addEventListener(
        "input",
        (e) => {
            if (!e.isTrusted) return;
            const input = inputFromEvent(e);
            if (!input) return;
            checkForWrongField(input);
            // Pastes are handled above with the clipboard text, which also
            // covers one-box-per-digit fields whose box holds a single digit
            if ((e as InputEvent).inputType === "insertFromPaste") return;
            void checkForMissedField(input, input.value, false);
        },
        true
    );
};
