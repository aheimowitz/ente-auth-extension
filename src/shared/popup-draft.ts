/**
 * In-progress add/edit form state, kept so closing the popup doesn't lose it.
 * Holds a TOTP secret, so it lives in session storage and is cleared on lock.
 */
import { browser } from "./browser";
import type { Code } from "./types";

export interface PopupDraft {
    mode: "add" | "edit";
    codeId?: string;
    data: Partial<Code>;
}

const KEY = "popupDraft";
// Firefox MV2 has no storage.session; mirror sessionStore's prefixed-local fallback
const FALLBACK_KEY = `session_${KEY}`;

export const getPopupDraft = async (): Promise<PopupDraft | undefined> => {
    if (browser.storage.session) {
        const result = await browser.storage.session.get(KEY);
        return result[KEY] as PopupDraft | undefined;
    }
    const result = await browser.storage.local.get(FALLBACK_KEY);
    return result[FALLBACK_KEY] as PopupDraft | undefined;
};

export const setPopupDraft = async (draft: PopupDraft): Promise<void> => {
    if (browser.storage.session) {
        await browser.storage.session.set({ [KEY]: draft });
    } else {
        await browser.storage.local.set({ [FALLBACK_KEY]: draft });
    }
};

export const clearPopupDraft = async (): Promise<void> => {
    if (browser.storage.session) {
        await browser.storage.session.remove(KEY);
    } else {
        await browser.storage.local.remove(FALLBACK_KEY);
    }
};
