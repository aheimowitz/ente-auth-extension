/**
 * Check whether a value someone entered on a page is one of the user's own
 * codes right now, for noticing code fields Duckey missed. Runs in the
 * background so the content script never receives the codes or secrets,
 * only the answer.
 */
import { generateOTPs } from "@shared/otp";
import { getAuthState } from "./auth";
import { getCodes, getTimeOffset } from "./sync";

/**
 * True if the value matches the previous, current or next code of any of the
 * user's codes (allowing for slow typing and clock drift). Null when the vault
 * is locked or logged out, so it can't be checked.
 */
export const isOwnCode = async (value: string): Promise<boolean | null> => {
    if (!/^\d{6,8}$/.test(value)) return false;
    const auth = await getAuthState();
    if (!auth.isLoggedIn || !auth.isUnlocked) return null;

    const [codes, timeOffset] = await Promise.all([getCodes(), getTimeOffset()]);
    return codes.some((code) => {
        try {
            const [current, next] = generateOTPs(code, timeOffset);
            if (value === current || value === next) return true;
            if (code.type === "totp") {
                const [previous] = generateOTPs(code, timeOffset - code.period * 1000);
                return value === previous;
            }
        } catch {
            // A code that can't generate (bad secret) can't match
        }
        return false;
    });
};
