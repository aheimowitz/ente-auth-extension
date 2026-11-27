/**
 * Decides when a page may show a "report this field" suggestion, so the
 * prompts stay rare. Remembered per site in local extension storage (on this
 * device only, cleared on logout):
 *
 * - Shown: that site isn't asked again for a day, even if the card was ignored.
 * - "Not now" or clicking away: not asked again for a week.
 * - "Report this field" or "Don't ask on this site": never asked again on that
 *   site, until the user resets it in Settings.
 *
 * On top of that, at most MAX_PER_DAY suggestions are shown per day across all
 * sites, and none at all when "Suggest reporting detection problems" is off.
 */
import { localStore, settingsStorage } from "./storage";

const STORAGE_KEY = "reportSuggestions";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_DAY = 3;
const SNOOZE_AFTER_SHOWN_MS = DAY_MS;
const SNOOZE_AFTER_NOT_NOW_MS = 7 * DAY_MS;

export type SuggestionAnswer = "reported" | "not-now" | "never";

interface SuggestionRecord {
    /** Per hostname: ask again after this time (ms), or never when null */
    sites: Record<string, { until: number | null }>;
    /** When suggestions were shown, for the daily limit */
    shown: number[];
}

const load = async (): Promise<SuggestionRecord> => {
    const stored = await localStore.get<SuggestionRecord>(STORAGE_KEY);
    return { sites: stored?.sites ?? {}, shown: stored?.shown ?? [] };
};

/** Drop expired snoozes and old shown times so the record stays small */
const prune = (record: SuggestionRecord, now: number): SuggestionRecord => {
    const sites: SuggestionRecord["sites"] = {};
    for (const [host, entry] of Object.entries(record.sites)) {
        if (entry.until === null || entry.until > now) sites[host] = entry;
    }
    return { sites, shown: record.shown.filter((t) => now - t < DAY_MS) };
};

const isSnoozed = (record: SuggestionRecord, hostname: string, now: number): boolean => {
    const entry = record.sites[hostname];
    return !!entry && (entry.until === null || entry.until > now);
};

const allowed = async (hostname: string, record: SuggestionRecord, now: number): Promise<boolean> => {
    if (!hostname) return false;
    const settings = await settingsStorage.getSettings();
    if (!settings.suggestDetectionReports) return false;
    return !isSnoozed(record, hostname, now) && record.shown.length < MAX_PER_DAY;
};

/**
 * Whether a suggestion could be shown on this site right now, without
 * counting one as shown. Lets the page skip its checks when it couldn't.
 */
export const canSuggest = async (hostname: string): Promise<boolean> => {
    const now = Date.now();
    return allowed(hostname, prune(await load(), now), now);
};

/**
 * Ask permission to show a suggestion on this site. If allowed, it is
 * counted as shown right away, so a card that's ignored still counts.
 */
export const claimSuggestion = async (hostname: string): Promise<boolean> => {
    const now = Date.now();
    const record = prune(await load(), now);
    if (!(await allowed(hostname, record, now))) return false;
    record.shown.push(now);
    record.sites[hostname] = { until: now + SNOOZE_AFTER_SHOWN_MS };
    await localStore.set(STORAGE_KEY, record);
    return true;
};

/** Remember how the user answered a suggestion on this site */
export const answerSuggestion = async (hostname: string, answer: SuggestionAnswer): Promise<void> => {
    if (!hostname) return;
    const now = Date.now();
    const record = prune(await load(), now);
    record.sites[hostname] = { until: answer === "not-now" ? now + SNOOZE_AFTER_NOT_NOW_MS : null };
    await localStore.set(STORAGE_KEY, record);
};

/** How many sites will never be asked again, for Settings */
export const countMutedSites = async (): Promise<number> => {
    const record = prune(await load(), Date.now());
    return Object.values(record.sites).filter((entry) => entry.until === null).length;
};

/** Forget all answers and snoozes, so every site may be asked again */
export const resetSuggestions = async (): Promise<void> => {
    await localStore.remove(STORAGE_KEY);
};
