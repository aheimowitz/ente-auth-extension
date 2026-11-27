/**
 * Bookkeeping for the prompts that offer to report a detection problem
 * (see DetectionProblem). Each prompt is shown at most once per site per tab:
 * any answer, including clicking away, dismisses it. sessionStorage is
 * per-origin and per-tab and survives reloads.
 */
import type { DetectionProblem } from "@shared/types";

const KEY_PREFIX = "ente_auth_report_prompt_dismissed:";
// Used when sessionStorage is unavailable (e.g. sandboxed iframes)
const dismissedInMemory = new Set<DetectionProblem>();

export const isSuggestionDismissed = (problem: DetectionProblem): boolean => {
    if (dismissedInMemory.has(problem)) return true;
    try {
        return sessionStorage.getItem(KEY_PREFIX + problem) === "1";
    } catch {
        return false;
    }
};

export const dismissSuggestion = (problem: DetectionProblem): void => {
    dismissedInMemory.add(problem);
    try {
        sessionStorage.setItem(KEY_PREFIX + problem, "1");
    } catch {
        // In-memory flag applies
    }
};
