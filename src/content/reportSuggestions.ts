/**
 * Page side of the "report this field" suggestions. The background decides
 * whether a site may be asked (see background/report-suggestions.ts); this
 * also limits each page load to one suggestion, whatever the kind.
 */
import { sendMessage } from "@shared/browser";

let shownOnThisPage = false;

const ask = async (type: "CAN_SUGGEST_REPORT" | "CLAIM_REPORT_SUGGESTION"): Promise<boolean> => {
    try {
        const res = await sendMessage<{ success: boolean; data?: { allowed: boolean } }>({ type });
        return !!res?.data?.allowed;
    } catch {
        return false;
    }
};

/**
 * Whether a suggestion could be shown here, without counting one. Checked
 * before doing work (like checking a typed code) that only matters if so.
 */
export const canSuggestReport = async (): Promise<boolean> =>
    !shownOnThisPage && (await ask("CAN_SUGGEST_REPORT"));

/** Claim the right to show a suggestion now. Counts it as shown if granted. */
export const claimReportSuggestion = async (): Promise<boolean> => {
    if (shownOnThisPage) return false;
    shownOnThisPage = true;
    const allowed = await ask("CLAIM_REPORT_SUGGESTION");
    // Not shown after all, so a later problem on this page may still ask
    if (!allowed) shownOnThisPage = false;
    return allowed;
};

/** Remember "Not now" (a week) or "Don't ask on this site" (for good) */
export const answerReportSuggestion = (answer: "not-now" | "never"): void => {
    sendMessage({ type: "ANSWER_REPORT_SUGGESTION", answer }).catch(() => {});
};
