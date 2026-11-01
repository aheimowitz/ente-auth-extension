/**
 * Popup view state, kept so closing the popup doesn't lose it: the open
 * add/edit form (with its in-progress values) and the list's search/tag filter.
 * The form can hold a TOTP secret, so this lives in session storage and is
 * cleared on lock.
 */
import { browser } from "./browser";
import type { Code } from "./types";

export interface PopupDraft {
    mode: "add" | "edit";
    codeId?: string;
    /** Field values; absent while the form is untouched */
    data?: Partial<Code>;
}

export interface PopupListState {
    searchQuery: string;
    selectedTag: string;
}

const DRAFT_KEY = "popupDraft";
const LIST_KEY = "popupListState";

// Firefox MV2 has no storage.session; mirror sessionStore's prefixed-local fallback
const getItem = async <T>(key: string): Promise<T | undefined> => {
    if (browser.storage.session) {
        const result = await browser.storage.session.get(key);
        return result[key] as T | undefined;
    }
    const result = await browser.storage.local.get(`session_${key}`);
    return result[`session_${key}`] as T | undefined;
};

const setItem = async (key: string, value: unknown): Promise<void> => {
    if (browser.storage.session) {
        await browser.storage.session.set({ [key]: value });
    } else {
        await browser.storage.local.set({ [`session_${key}`]: value });
    }
};

const removeItem = async (key: string): Promise<void> => {
    if (browser.storage.session) {
        await browser.storage.session.remove(key);
    } else {
        await browser.storage.local.remove(`session_${key}`);
    }
};

export const getPopupDraft = (): Promise<PopupDraft | undefined> => getItem<PopupDraft>(DRAFT_KEY);
export const setPopupDraft = (draft: PopupDraft): Promise<void> => setItem(DRAFT_KEY, draft);
export const clearPopupDraft = (): Promise<void> => removeItem(DRAFT_KEY);

export const getPopupListState = (): Promise<PopupListState | undefined> =>
    getItem<PopupListState>(LIST_KEY);
export const setPopupListState = (state: PopupListState): Promise<void> => setItem(LIST_KEY, state);

/**
 * Forget all saved popup view state (on lock).
 */
export const clearPopupState = async (): Promise<void> => {
    await Promise.all([removeItem(DRAFT_KEY), removeItem(LIST_KEY)]);
};
