/**
 * Auth-specific API functions (public endpoints, no auth token needed).
 */
import type {
    SRPAttributes,
    EmailVerificationResponse,
    TwoFactorAuthorizationResponse,
} from "./types";

const publicHeaders: HeadersInit = {
    "Content-Type": "application/json",
    "X-Client-Package": "io.ente.auth.web",
};

/**
 * Fetch SRP attributes for a user by email.
 * Returns undefined if the user doesn't exist or hasn't set up SRP.
 */
export const getSRPAttributes = async (
    apiUrl: string,
    email: string,
): Promise<SRPAttributes | undefined> => {
    const url = new URL("/users/srp/attributes", apiUrl);
    url.searchParams.set("email", email);

    const res = await fetch(url.toString(), {
        headers: publicHeaders,
    });

    if (res.status === 404) return undefined;
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to get SRP attributes (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as { attributes: SRPAttributes };
    return data.attributes;
};

/**
 * Request an email OTT (one-time token) for login.
 */
export const requestEmailOTT = async (
    apiUrl: string,
    email: string,
): Promise<void> => {
    const res = await fetch(`${apiUrl}/users/ott`, {
        method: "POST",
        headers: publicHeaders,
        body: JSON.stringify({ email, purpose: "login" }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to request email OTT (${res.status}): ${errText}`);
    }
};

/**
 * Verify email with OTT code.
 */
export const verifyEmail = async (
    apiUrl: string,
    email: string,
    ott: string,
): Promise<EmailVerificationResponse> => {
    const res = await fetch(`${apiUrl}/users/verify-email`, {
        method: "POST",
        headers: publicHeaders,
        body: JSON.stringify({ email, ott }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Email verification failed (${res.status}): ${errText}`);
    }
    return (await res.json()) as EmailVerificationResponse;
};

/**
 * Verify TOTP two-factor code.
 */
export const verifyTwoFactor = async (
    apiUrl: string,
    sessionID: string,
    code: string,
): Promise<TwoFactorAuthorizationResponse> => {
    const res = await fetch(`${apiUrl}/users/two-factor/verify`, {
        method: "POST",
        headers: publicHeaders,
        body: JSON.stringify({ code, sessionID }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Two-factor verification failed (${res.status}): ${errText}`);
    }
    return (await res.json()) as TwoFactorAuthorizationResponse;
};

/**
 * Check the status of a passkey verification session.
 * Returns the authorization response if verified, undefined if still pending.
 * Throws on session expiry (404/410) or other errors.
 */
export const checkPasskeyVerificationStatus = async (
    apiUrl: string,
    sessionID: string,
): Promise<TwoFactorAuthorizationResponse | undefined> => {
    const url = `${apiUrl}/users/two-factor/passkeys/get-token?sessionID=${encodeURIComponent(sessionID)}`;
    const res = await fetch(url, { headers: publicHeaders });
    if (res.status === 400) return undefined; // Still pending
    if (res.status === 404 || res.status === 410) {
        throw new Error("Passkey verification session expired. Please try again.");
    }
    if (!res.ok) throw new Error(`Passkey status check failed (${res.status})`);
    return (await res.json()) as TwoFactorAuthorizationResponse;
};
