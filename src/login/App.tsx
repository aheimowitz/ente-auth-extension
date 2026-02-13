/**
 * Login page application component.
 * Multi-step login flow: email -> password (SRP) / email OTT -> 2FA/passkey -> success.
 */
import React, { useEffect, useRef, useState } from "react";
import { sendMessage } from "@shared/browser";
import { useTheme } from "@shared/useTheme";
import { getApiBaseUrl } from "@shared/api";
import { getSRPAttributes, requestEmailOTT, verifyEmail, verifyTwoFactor, checkPasskeyVerificationStatus } from "@shared/api-auth";
import { verifySRP } from "@shared/srp";
import { deriveKey, decryptBoxBytes, boxSealOpenBytes, toB64, toB64URLSafe } from "@shared/crypto";
import type {
    SRPAttributes,
    KeyAttributes,
    ExtensionSettings,
} from "@shared/types";

type Step =
    | "email"
    | "password"
    | "email-ott"
    | "password-decrypt"
    | "two-factor"
    | "passkey-choice"
    | "passkey"
    | "success";

const PASSKEY_POLL_INTERVAL = 100; // 100ms for near-instant detection
const PASSKEY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export const App: React.FC = () => {
    useTheme();

    const [step, setStep] = useState<Step>("email");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [ottCode, setOttCode] = useState("");
    const [twoFactorCode, setTwoFactorCode] = useState("");
    const [serverUrl, setServerUrl] = useState("");
    const [accountsUrl, setAccountsUrl] = useState("");
    const [showServerInput, setShowServerInput] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Stashed state between steps
    const [srpAttributes, setSrpAttributes] = useState<SRPAttributes | null>(null);
    const [twoFactorSessionID, setTwoFactorSessionID] = useState<string | null>(null);
    const [passkeySessionID, setPasskeySessionID] = useState<string | null>(null);
    const [stashedEncryptedToken, setStashedEncryptedToken] = useState<string | null>(null);
    const [stashedKeyAttributes, setStashedKeyAttributes] = useState<KeyAttributes | null>(null);
    const [stashedToken, setStashedToken] = useState<string | null>(null);
    const [stashedMasterKey, setStashedMasterKey] = useState<string | null>(null);

    // Passkey polling refs
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Ref to avoid stale closure in polling callback
    const stashedMasterKeyRef = useRef<string | null>(null);
    // Reference to the accounts tab opened for passkey verification
    const passkeyTabRef = useRef<Window | null>(null);
    // Guard against multiple in-flight poll responses completing login twice
    const passkeyCompleteRef = useRef(false);

    // Load server URL and accounts URL from settings on mount
    useEffect(() => {
        (async () => {
            try {
                const response = await sendMessage<{
                    success: boolean;
                    data?: ExtensionSettings;
                }>({ type: "GET_SETTINGS" });
                if (response.success && response.data) {
                    if (response.data.serverUrl) {
                        setServerUrl(response.data.serverUrl);
                        setShowServerInput(true);
                    }
                    if (response.data.accountsUrl) {
                        setAccountsUrl(response.data.accountsUrl);
                    }
                }
            } catch {
                // Ignore - use default
            }
        })();
    }, []);

    // Keep ref in sync with state for use in polling callbacks
    useEffect(() => {
        stashedMasterKeyRef.current = stashedMasterKey;
    }, [stashedMasterKey]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            stopPasskeyPolling();
        };
    }, []);

    const getApiUrl = (): string => {
        if (serverUrl.trim()) {
            return serverUrl.trim().replace(/\/+$/, "");
        }
        return getApiBaseUrl();
    };

    const getAccountsUrl = (): string => {
        if (accountsUrl.trim()) {
            return accountsUrl.trim().replace(/\/+$/, "");
        }
        return "https://accounts.ente.io";
    };

    /**
     * Decrypt the master key from key attributes using the KEK.
     */
    const decryptMasterKey = async (
        keyAttrs: KeyAttributes,
        kek: string,
    ): Promise<string> => {
        const masterKeyBytes = await decryptBoxBytes(
            {
                encryptedData: keyAttrs.encryptedKey,
                nonce: keyAttrs.keyDecryptionNonce,
            },
            kek,
        );
        return toB64(masterKeyBytes);
    };

    /**
     * Decrypt an encrypted token using the user's key pair.
     * The encryptedToken is sealed with the public key, so we need the private key to open it.
     */
    const decryptToken = async (
        encryptedToken: string,
        keyAttrs: KeyAttributes,
        masterKey: string,
    ): Promise<string> => {
        // Decrypt the private key using the master key
        const privateKeyBytes = await decryptBoxBytes(
            {
                encryptedData: keyAttrs.encryptedSecretKey,
                nonce: keyAttrs.secretKeyDecryptionNonce,
            },
            masterKey,
        );
        const privateKey = await toB64(privateKeyBytes);

        // Use box_seal_open to decrypt the token
        const tokenBytes = await boxSealOpenBytes(encryptedToken, {
            publicKey: keyAttrs.publicKey,
            privateKey,
        });
        return toB64URLSafe(tokenBytes);
    };

    /**
     * Send LOGIN_COMPLETE to the background script and transition to success.
     */
    const completeLogin = async (
        token: string,
        keyAttrs: KeyAttributes,
        masterKey: string,
    ) => {
        // Save server URL and accounts URL settings if custom
        const settingsToSave: Partial<ExtensionSettings> = {};
        if (serverUrl.trim()) {
            settingsToSave.serverUrl = serverUrl.trim().replace(/\/+$/, "");
        }
        if (accountsUrl.trim()) {
            settingsToSave.accountsUrl = accountsUrl.trim().replace(/\/+$/, "");
        }
        if (Object.keys(settingsToSave).length > 0) {
            await sendMessage({
                type: "SET_SETTINGS",
                settings: settingsToSave,
            });
        }

        const response = await sendMessage<{ success: boolean; error?: string }>({
            type: "LOGIN_COMPLETE",
            token,
            email,
            keyAttributes: keyAttrs,
            masterKey,
        });

        if (!response.success) {
            throw new Error(response.error || "Login failed");
        }

        setStep("success");
    };

    /**
     * Close the accounts tab that was opened for passkey verification.
     */
    const closePasskeyTab = () => {
        try {
            passkeyTabRef.current?.close();
        } catch {
            // Cross-origin or already closed - ignore
        }
        passkeyTabRef.current = null;
    };

    /**
     * Stop passkey polling interval and timeout.
     */
    const stopPasskeyPolling = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
        }
    };

    /**
     * Start passkey verification: open accounts tab and begin polling.
     */
    const startPasskeyVerification = (sessionID: string) => {
        setError(null);
        setLoading(true);
        passkeyCompleteRef.current = false;

        // Open the accounts verification page in a new tab.
        // The redirect param is required by accounts.ente.io's whitelist check.
        // We can't redirect back to chrome-extension:// (not whitelisted), so we
        // redirect to the accounts URL itself. The tab gets auto-closed by
        // polling before the redirect is visible to the user.
        const acctUrl = getAccountsUrl();
        const params = new URLSearchParams({
            passkeySessionID: sessionID,
            clientPackage: "io.ente.auth.web",
            redirect: acctUrl,
        });
        const tab = window.open(`${acctUrl}/passkeys/verify?${params.toString()}`, "_blank");
        passkeyTabRef.current = tab;

        // Start polling
        startPasskeyPolling(sessionID);
    };

    /**
     * Poll for passkey verification status.
     */
    const startPasskeyPolling = (sessionID: string) => {
        stopPasskeyPolling();

        const apiUrl = getApiUrl();

        // Set up the 5-minute timeout
        pollTimeoutRef.current = setTimeout(() => {
            stopPasskeyPolling();
            setLoading(false);
            setError("Passkey verification timed out. Please try again.");
        }, PASSKEY_TIMEOUT);

        pollIntervalRef.current = setInterval(async () => {
            if (passkeyCompleteRef.current) return; // Already handled
            try {
                const result = await checkPasskeyVerificationStatus(apiUrl, sessionID);
                if (!result) return; // Still pending
                if (passkeyCompleteRef.current) return; // Another in-flight request already handled this
                passkeyCompleteRef.current = true;

                // Success - stop polling and close accounts tab
                stopPasskeyPolling();
                closePasskeyTab();

                const keyAttrs = result.keyAttributes;
                const encToken = result.encryptedToken;

                // If we have the KEK stashed (from password/SRP step), complete login
                const kek = stashedMasterKeyRef.current;
                if (kek && keyAttrs && encToken) {
                    const masterKey = await decryptMasterKey(keyAttrs, kek);
                    const token = await decryptToken(encToken, keyAttrs, masterKey);
                    await completeLogin(token, keyAttrs, masterKey);
                    setLoading(false);
                    return;
                }

                // Otherwise (email OTT path), need password to decrypt
                setStashedKeyAttributes(keyAttrs);
                setStashedEncryptedToken(encToken);
                setLoading(false);
                setStep("password-decrypt");
            } catch (e) {
                stopPasskeyPolling();
                setLoading(false);
                setError(e instanceof Error ? e.message : "Passkey verification failed");
            }
        }, PASSKEY_POLL_INTERVAL);
    };

    /**
     * Manually check passkey status (triggered by "Check status" button).
     */
    const handleCheckPasskeyStatus = async () => {
        if (!passkeySessionID) return;
        setError(null);

        try {
            const apiUrl = getApiUrl();
            const result = await checkPasskeyVerificationStatus(apiUrl, passkeySessionID);
            if (!result) {
                setError("Verification not yet complete. Please complete the passkey verification in the opened tab.");
                return;
            }

            // Success - stop polling and close accounts tab
            stopPasskeyPolling();
            closePasskeyTab();

            const keyAttrs = result.keyAttributes;
            const encToken = result.encryptedToken;

            const kek = stashedMasterKeyRef.current;
            if (kek && keyAttrs && encToken) {
                const masterKey = await decryptMasterKey(keyAttrs, kek);
                const token = await decryptToken(encToken, keyAttrs, masterKey);
                await completeLogin(token, keyAttrs, masterKey);
                setLoading(false);
                return;
            }

            setStashedKeyAttributes(keyAttrs);
            setStashedEncryptedToken(encToken);
            setLoading(false);
            setStep("password-decrypt");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Passkey verification failed");
        }
    };

    // Step 1: Email submission
    const handleEmailSubmit = async () => {
        if (!email.trim()) return;

        setError(null);
        setLoading(true);

        try {
            const apiUrl = getApiUrl();
            const attrs = await getSRPAttributes(apiUrl, email.trim());

            if (attrs && !attrs.isEmailMFAEnabled) {
                // SRP path: user has SRP set up and doesn't want email MFA
                setSrpAttributes(attrs);
                setStep("password");
            } else {
                // Email OTT path: no SRP or user prefers email MFA
                if (attrs) {
                    // Stash SRP attributes (we still need kekSalt/opsLimit/memLimit for password decryption later)
                    setSrpAttributes(attrs);
                }
                await requestEmailOTT(apiUrl, email.trim());
                setStep("email-ott");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to connect");
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Password submission (SRP path)
    const handlePasswordSubmit = async () => {
        if (!password || !srpAttributes) return;

        setError(null);
        setLoading(true);

        // Yield to let React paint the spinner before heavy key derivation
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

        try {
            const apiUrl = getApiUrl();

            // Derive KEK from password
            const kek = await deriveKey(
                password,
                srpAttributes.kekSalt,
                srpAttributes.opsLimit,
                srpAttributes.memLimit,
            );

            // Perform SRP verification
            const srpResponse = await verifySRP(apiUrl, srpAttributes, kek);

            const hasPasskey = !!srpResponse.passkeySessionID;
            const hasTOTP = !!(srpResponse.twoFactorSessionID || srpResponse.twoFactorSessionIDV2);
            const effectiveTwoFactorSessionID =
                srpResponse.twoFactorSessionID || srpResponse.twoFactorSessionIDV2;

            // Stash KEK for later use (2FA or passkey)
            if (hasPasskey || hasTOTP) {
                setStashedMasterKey(kek);
                if (srpResponse.keyAttributes) {
                    setStashedKeyAttributes(srpResponse.keyAttributes);
                }
            }

            if (hasPasskey && hasTOTP) {
                // Both passkey and TOTP available - let user choose
                setPasskeySessionID(srpResponse.passkeySessionID!);
                setTwoFactorSessionID(effectiveTwoFactorSessionID!);
                setLoading(false);
                setStep("passkey-choice");
                return;
            }

            if (hasPasskey && !hasTOTP) {
                // Passkey only - go directly to passkey step
                // Don't clear loading - startPasskeyVerification keeps it for the polling spinner
                setPasskeySessionID(srpResponse.passkeySessionID!);
                setStep("passkey");
                startPasskeyVerification(srpResponse.passkeySessionID!);
                return;
            }

            if (hasTOTP) {
                // TOTP only - existing flow
                setTwoFactorSessionID(effectiveTwoFactorSessionID!);
                setLoading(false);
                setStep("two-factor");
                return;
            }

            // No 2FA
            const keyAttrs = srpResponse.keyAttributes;
            if (!keyAttrs) {
                throw new Error("No key attributes in SRP response");
            }

            // Decrypt master key
            const masterKey = await decryptMasterKey(keyAttrs, kek);

            // Determine the auth token
            let token: string;
            if (srpResponse.token) {
                token = srpResponse.token;
            } else if (srpResponse.encryptedToken) {
                token = await decryptToken(srpResponse.encryptedToken, keyAttrs, masterKey);
            } else {
                throw new Error("No token in SRP response");
            }

            await completeLogin(token, keyAttrs, masterKey);
            setLoading(false);
        } catch (e) {
            setLoading(false);
            setError(e instanceof Error ? e.message : "Login failed");
        }
    };

    // Step 3: Email OTT verification
    const handleOTTSubmit = async () => {
        if (!ottCode.trim()) return;

        setError(null);
        setLoading(true);

        try {
            const apiUrl = getApiUrl();
            const response = await verifyEmail(apiUrl, email.trim(), ottCode.trim());

            const hasPasskey = !!response.passkeySessionID;
            const hasTOTP = !!(response.twoFactorSessionID || response.twoFactorSessionIDV2);
            const effectiveTwoFactorSessionID =
                response.twoFactorSessionID || response.twoFactorSessionIDV2;

            if (hasPasskey && hasTOTP) {
                // Both passkey and TOTP available - let user choose
                setPasskeySessionID(response.passkeySessionID!);
                setTwoFactorSessionID(effectiveTwoFactorSessionID!);
                if (response.encryptedToken) {
                    setStashedEncryptedToken(response.encryptedToken);
                }
                if (response.keyAttributes) {
                    setStashedKeyAttributes(response.keyAttributes);
                }
                setLoading(false);
                setStep("passkey-choice");
                return;
            }

            if (hasPasskey && !hasTOTP) {
                // Passkey only
                // Don't clear loading - startPasskeyVerification keeps it for the polling spinner
                setPasskeySessionID(response.passkeySessionID!);
                if (response.encryptedToken) {
                    setStashedEncryptedToken(response.encryptedToken);
                }
                if (response.keyAttributes) {
                    setStashedKeyAttributes(response.keyAttributes);
                }
                setStep("passkey");
                startPasskeyVerification(response.passkeySessionID!);
                return;
            }

            if (hasTOTP) {
                // TOTP only - existing flow
                setTwoFactorSessionID(effectiveTwoFactorSessionID!);
                if (response.encryptedToken) {
                    setStashedEncryptedToken(response.encryptedToken);
                }
                if (response.keyAttributes) {
                    setStashedKeyAttributes(response.keyAttributes);
                }
                setLoading(false);
                setStep("two-factor");
                return;
            }

            if (response.keyAttributes && response.encryptedToken) {
                // Need password to decrypt master key, then decrypt token
                setStashedKeyAttributes(response.keyAttributes);
                setStashedEncryptedToken(response.encryptedToken);
                setLoading(false);
                setStep("password-decrypt");
                return;
            }

            if (response.token) {
                // Rare case: no key attributes, just a plain token
                setStashedToken(response.token);
                setLoading(false);
                setStep("success");
                return;
            }

            throw new Error("Unexpected verification response");
        } catch (e) {
            setLoading(false);
            setError(e instanceof Error ? e.message : "Verification failed");
        }
    };

    // Step 4: Password for decryption (after email OTT)
    const handlePasswordDecryptSubmit = async () => {
        if (!password || !stashedKeyAttributes) return;

        setError(null);
        setLoading(true);

        // Yield to let React paint the spinner before heavy key derivation
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

        try {
            // Derive KEK from password using key attributes
            const kek = await deriveKey(
                password,
                stashedKeyAttributes.kekSalt,
                stashedKeyAttributes.opsLimit,
                stashedKeyAttributes.memLimit,
            );

            // Decrypt master key
            const masterKey = await decryptMasterKey(stashedKeyAttributes, kek);

            // Decrypt token
            const encToken = stashedEncryptedToken;
            if (!encToken) {
                throw new Error("No encrypted token available");
            }

            const token = await decryptToken(encToken, stashedKeyAttributes, masterKey);

            await completeLogin(token, stashedKeyAttributes, masterKey);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Incorrect password");
        } finally {
            setLoading(false);
        }
    };

    // Step 5: 2FA verification
    const handleTwoFactorSubmit = async () => {
        if (!twoFactorCode.trim() || !twoFactorSessionID) return;

        setError(null);
        setLoading(true);

        try {
            const apiUrl = getApiUrl();
            const response = await verifyTwoFactor(
                apiUrl,
                twoFactorSessionID,
                twoFactorCode.trim(),
            );

            const keyAttrs = response.keyAttributes;
            const encToken = response.encryptedToken;

            // If we have the KEK stashed (from SRP password step), derive master key
            if (stashedMasterKey && keyAttrs && encToken) {
                const masterKey = await decryptMasterKey(keyAttrs, stashedMasterKey);
                const token = await decryptToken(encToken, keyAttrs, masterKey);
                await completeLogin(token, keyAttrs, masterKey);
                return;
            }

            // Otherwise we need the user's password to decrypt
            setStashedKeyAttributes(keyAttrs);
            setStashedEncryptedToken(encToken);
            setStep("password-decrypt");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Verification failed");
        } finally {
            setLoading(false);
        }
    };

    // Resend email OTT
    const handleResendOTT = async () => {
        setError(null);
        try {
            const apiUrl = getApiUrl();
            await requestEmailOTT(apiUrl, email.trim());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to resend code");
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <Logo />
                </div>

                {step === "email" && (
                    <>
                        <h1 className="login-title">Log in to Ente Auth</h1>
                        <form
                            className="login-form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleEmailSubmit();
                            }}
                        >
                            <input
                                type="email"
                                className="login-input"
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoFocus
                                disabled={loading}
                            />
                            {showServerInput && (
                                <input
                                    type="url"
                                    className="login-input"
                                    placeholder="Server endpoint"
                                    value={serverUrl}
                                    onChange={(e) => setServerUrl(e.target.value)}
                                    disabled={loading}
                                />
                            )}
                            <button
                                type="submit"
                                className="login-button"
                                disabled={!email.trim() || loading}
                            >
                                {loading ? <Spinner /> : "Continue"}
                            </button>
                            {error && <div className="login-error">{error}</div>}
                        </form>
                        {showServerInput ? (
                            <button
                                className="login-link"
                                onClick={() => {
                                    setShowServerInput(false);
                                    setServerUrl("");
                                }}
                            >
                                Use Ente Cloud
                            </button>
                        ) : (
                            <button
                                className="login-link"
                                onClick={() => setShowServerInput(true)}
                            >
                                Self-hosted?
                            </button>
                        )}
                    </>
                )}

                {step === "password" && (
                    <>
                        <h1 className="login-title">Enter your password</h1>
                        <p className="login-subtitle">{email}</p>
                        <form
                            className="login-form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handlePasswordSubmit();
                            }}
                        >
                            <input
                                type="password"
                                className="login-input"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="login-button"
                                disabled={!password || loading}
                            >
                                {loading ? <Spinner /> : "Log in"}
                            </button>
                            {error && <div className="login-error">{error}</div>}
                        </form>
                        <button
                            className="login-link"
                            onClick={() => {
                                setPassword("");
                                setError(null);
                                setStep("email");
                            }}
                        >
                            Back
                        </button>
                    </>
                )}

                {step === "email-ott" && (
                    <>
                        <h1 className="login-title">Check your email</h1>
                        <p className="login-subtitle">
                            We've sent a verification code to <strong>{email}</strong>
                        </p>
                        <form
                            className="login-form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleOTTSubmit();
                            }}
                        >
                            <input
                                type="text"
                                className="login-input ott-input"
                                placeholder="6-digit code"
                                value={ottCode}
                                onChange={(e) => setOttCode(e.target.value)}
                                autoFocus
                                maxLength={6}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="login-button"
                                disabled={!ottCode.trim() || loading}
                            >
                                {loading ? <Spinner /> : "Verify"}
                            </button>
                            {error && <div className="login-error">{error}</div>}
                        </form>
                        <button className="login-link" onClick={handleResendOTT}>
                            Resend code
                        </button>
                    </>
                )}

                {step === "password-decrypt" && (
                    <>
                        <h1 className="login-title">Enter your password</h1>
                        <p className="login-subtitle">
                            Enter your Ente password to decrypt your data
                        </p>
                        <form
                            className="login-form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handlePasswordDecryptSubmit();
                            }}
                        >
                            <input
                                type="password"
                                className="login-input"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="login-button"
                                disabled={!password || loading}
                            >
                                {loading ? <Spinner /> : "Continue"}
                            </button>
                            {error && <div className="login-error">{error}</div>}
                        </form>
                    </>
                )}

                {step === "two-factor" && (
                    <>
                        <h1 className="login-title">Two-factor authentication</h1>
                        <p className="login-subtitle">
                            Enter the 6-digit code from your authenticator app
                        </p>
                        <form
                            className="login-form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleTwoFactorSubmit();
                            }}
                        >
                            <input
                                type="text"
                                className="login-input ott-input"
                                placeholder="6-digit code"
                                value={twoFactorCode}
                                onChange={(e) => setTwoFactorCode(e.target.value)}
                                autoFocus
                                maxLength={6}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="login-button"
                                disabled={!twoFactorCode.trim() || loading}
                            >
                                {loading ? <Spinner /> : "Verify"}
                            </button>
                            {error && <div className="login-error">{error}</div>}
                        </form>
                    </>
                )}

                {step === "passkey-choice" && (
                    <>
                        <h1 className="login-title">Choose verification method</h1>
                        <p className="login-subtitle">
                            Your account has multiple verification methods enabled
                        </p>
                        <div className="passkey-choice-buttons">
                            <button
                                className="passkey-choice-button"
                                onClick={() => {
                                    if (!passkeySessionID) return;
                                    setStep("passkey");
                                    startPasskeyVerification(passkeySessionID);
                                }}
                            >
                                <PasskeyIcon />
                                <span>Use passkey</span>
                            </button>
                            <button
                                className="passkey-choice-button secondary"
                                onClick={() => {
                                    setStep("two-factor");
                                }}
                            >
                                <AuthenticatorIcon />
                                <span>Use authenticator app</span>
                            </button>
                        </div>
                        {error && <div className="login-error">{error}</div>}
                        <button
                            className="login-link"
                            onClick={() => {
                                setPassword("");
                                setError(null);
                                setStep("email");
                            }}
                        >
                            Back
                        </button>
                    </>
                )}

                {step === "passkey" && (
                    <>
                        <h1 className="login-title">Verifying with passkey</h1>
                        <p className="login-subtitle">
                            Complete the passkey verification in the tab that was opened.
                        </p>
                        {loading && (
                            <div className="passkey-waiting">
                                <Spinner />
                                <p className="passkey-status-text">Waiting for verification...</p>
                            </div>
                        )}
                        <div className="passkey-actions">
                            <button
                                className="login-button passkey-action-button"
                                onClick={handleCheckPasskeyStatus}
                            >
                                Check status
                            </button>
                            <button
                                className="login-button passkey-action-button secondary"
                                onClick={() => {
                                    if (!passkeySessionID) return;
                                    startPasskeyVerification(passkeySessionID);
                                }}
                            >
                                Try again
                            </button>
                        </div>
                        {error && <div className="login-error">{error}</div>}
                        {twoFactorSessionID && (
                            <button
                                className="login-link"
                                onClick={() => {
                                    stopPasskeyPolling();
                                    setLoading(false);
                                    setError(null);
                                    setStep("two-factor");
                                }}
                            >
                                Use authenticator app instead
                            </button>
                        )}
                        <button
                            className="login-link"
                            onClick={() => {
                                stopPasskeyPolling();
                                setLoading(false);
                                setPassword("");
                                setError(null);
                                setStep("email");
                            }}
                        >
                            Cancel
                        </button>
                    </>
                )}

                {step === "success" && (
                    <div className="login-success">
                        <div className="success-checkmark">
                            <CheckCircleIcon />
                        </div>
                        <h1 className="login-title">Logged in to Ente Auth</h1>
                        <p className="login-subtitle">
                            Signed in as <strong>{email}</strong>
                        </p>
                        <p className="login-hint">You can close this tab.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const Logo: React.FC = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
        <path
            d="M12 2L3 7V12C3 16.97 6.84 21.66 12 23C17.16 21.66 21 16.97 21 12V7L12 2Z"
            fill="#8F33D6"
        />
        <path
            d="M10 17L6 13L7.41 11.59L10 14.17L16.59 7.58L18 9L10 17Z"
            fill="white"
        />
    </svg>
);

const Spinner: React.FC = () => (
    <div className="spinner" />
);

const CheckCircleIcon: React.FC = () => (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#1DB954" />
        <path
            d="M10 17L6 13L7.41 11.59L10 14.17L16.59 7.58L18 9L10 17Z"
            fill="white"
        />
    </svg>
);

const PasskeyIcon: React.FC = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2 7c0-1.4 0-2.1.272-2.635a2.5 2.5 0 0 1 1.093-1.093C3.9 3 4.6 3 6 3h2c1.4 0 2.1 0 2.635.272a2.5 2.5 0 0 1 1.093 1.093C12 4.9 12 5.6 12 7v2c0 1.4 0 2.1-.272 2.635a2.5 2.5 0 0 1-1.093 1.093C10.1 13 9.4 13 8 13H6c-1.4 0-2.1 0-2.635-.272a2.5 2.5 0 0 1-1.093-1.093C2 11.1 2 10.4 2 9V7Z" opacity="0.3" />
        <path d="M17 14a5 5 0 1 0-3.53 1.47L11 18v2h2v2h2v-2h1v-3.07A5 5 0 0 0 17 14Zm-1-4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
    </svg>
);

const AuthenticatorIcon: React.FC = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8Zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7Z" />
    </svg>
);
