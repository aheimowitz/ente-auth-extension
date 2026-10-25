/**
 * A parsed representation of an OTP code URI.
 */
export interface Code {
    /** A unique id for the corresponding "auth entity" in our system. */
    id: string;
    /** The type of the code. */
    type: "totp" | "hotp" | "steam";
    /** The user's account or email for which this code is used. */
    account?: string;
    /** The name of the entity that issued this code. */
    issuer: string;
    /**
     * Length of the generated OTP.
     */
    length: number;
    /**
     * The time period (in seconds) for which a single OTP generated from this
     * code remains valid.
     */
    period: number;
    /** The (HMAC) algorithm used by the OTP generator. */
    algorithm: "sha1" | "sha256" | "sha512";
    /**
     * HOTP counter.
     * Only valid for HOTP codes.
     */
    counter?: number;
    /**
     * The secret that is used to drive the OTP generator.
     * Base32 encoded.
     */
    secret: string;
    /**
     * Optional metadata containing Ente specific metadata.
     */
    codeDisplay: CodeDisplay | undefined;
    /** The original string from which this code was generated. */
    uriString: string;
}

export interface CodeDisplay {
    /** True if this code is in the Trash. */
    trashed?: boolean;
    /** True if this code has been pinned by the user. */
    pinned?: boolean;
    /** User-provided note or description for this code. */
    note?: string;
    /** Tags for organizing codes. */
    tags?: string[];
}

/**
 * Theme mode for the extension.
 */
export type ThemeMode = "light" | "dark" | "system";

/**
 * Accent color scheme: Duckey's mallard green, the Ente Auth purple, or a
 * user-picked color (see `accentCustomColor`).
 */
export type AccentTheme = "duckey" | "ente" | "custom";

/**
 * When the vault should auto-lock. Minute values are string representations
 * of the idle threshold in minutes.
 */
export type VaultTimeout = "never" | "onRestart" | "onSystemLock" | "5" | "15" | "60" | "240";

/**
 * Auth codes and time offset from sync.
 */
export interface AuthCodesAndTimeOffset {
    codes: Code[];
    /** Approximate correction (milliseconds) for TOTP derivation. */
    timeOffset?: number;
}

/**
 * Extension settings stored in local storage.
 */
export interface ExtensionSettings {
    /** Show autofill icon on MFA fields. Default: true */
    showAutofillIcon: boolean;
    /** Automatically fill when single match found. Default: false */
    autoFillSingleMatch: boolean;
    /** Automatically submit form after autofill when single match found. Default: false */
    autoSubmitSingleMatch: boolean;
    /** Sync interval in minutes. Default: 5 */
    syncInterval: number;
    /** Theme mode. Default: "system" */
    theme: ThemeMode;
    /** Accent color scheme. Default: "duckey" */
    accentTheme: AccentTheme;
    /** Hex color used when accentTheme is "custom". Default: "#2F6FDE" */
    accentCustomColor: string;
    /** When the vault auto-locks. Default: "never" */
    vaultTimeout: VaultTimeout;
    /** Custom server URL for self-hosted instances. Empty string means use Ente Cloud. */
    serverUrl: string;
    /** Custom accounts URL for passkey verification. Empty string means use the URL the server provides. */
    accountsUrl: string;
    /** Sort order for codes list. Default: "issuer" */
    sortOrder: "issuer" | "account" | "recent";
}

/**
 * Default extension settings.
 */
export const defaultSettings: ExtensionSettings = {
    showAutofillIcon: true,
    autoFillSingleMatch: false,
    autoSubmitSingleMatch: false,
    syncInterval: 5,
    theme: "system",
    accentTheme: "duckey",
    accentCustomColor: "#2F6FDE",
    vaultTimeout: "never",
    serverUrl: "",
    accountsUrl: "",
    sortOrder: "issuer",
};

/**
 * Form data for creating/updating a code.
 */
export interface CodeFormData {
    issuer: string;
    account?: string;
    secret: string;
    type: "totp" | "hotp" | "steam";
    algorithm: "sha1" | "sha256" | "sha512";
    digits: number;
    period: number;
    counter?: number;
    codeDisplay?: CodeDisplay;
}

/**
 * Parsed QR code data.
 */
export interface ParsedQRCode {
    uri: string;
    issuer: string;
    account?: string;
    secret: string;
    type: "totp" | "hotp" | "steam";
    algorithm: "sha1" | "sha256" | "sha512";
    digits: number;
    period: number;
    counter?: number;
}

/**
 * Message types for communication between extension components.
 */
export type ExtensionMessage =
    | { type: "GET_CODES"; forceSync?: boolean }
    | { type: "GET_CODES_FOR_DOMAIN"; domain: string }
    | { type: "SYNC_CODES" }
    | { type: "LOGIN"; token: string; keyAttributes: KeyAttributes }
    | { type: "LOGIN_COMPLETE"; token: string; email: string; keyAttributes: KeyAttributes; masterKey: string }
    | { type: "OPEN_LOGIN_PAGE" }
    | { type: "LOGOUT" }
    | { type: "LOCK" }
    | { type: "UNLOCK"; password: string }
    | { type: "UNLOCK_WITH_PIN"; pin: string }
    | { type: "SET_PIN"; pin: string }
    | { type: "REMOVE_PIN" }
    | { type: "GET_AUTH_STATE" }
    | { type: "GET_SETTINGS" }
    | { type: "SET_SETTINGS"; settings: Partial<ExtensionSettings> }
    | { type: "FILL_CODE"; code: string; tabId: number }
    | { type: "GET_CUSTOM_MAPPINGS" }
    | { type: "ADD_CUSTOM_MAPPING"; mapping: Omit<CustomDomainMapping, "createdAt"> }
    | { type: "DELETE_CUSTOM_MAPPING"; domain: string }
    | { type: "CREATE_CODE"; code: CodeFormData }
    | { type: "UPDATE_CODE"; id: string; code: CodeFormData }
    | { type: "DELETE_CODE"; id: string }
    | { type: "SCAN_QR_FROM_PAGE" };

/**
 * Response types for extension messages.
 */
export type ExtensionResponse =
    | { success: true; data?: unknown }
    | { success: false; error: string };

/**
 * Authentication state.
 */
export interface AuthState {
    isLoggedIn: boolean;
    isUnlocked: boolean;
    email?: string;
    hasPIN: boolean;
}

/**
 * Key attributes for deriving the master key.
 */
export interface KeyAttributes {
    kekSalt: string;
    opsLimit: number;
    memLimit: number;
    encryptedKey: string;
    keyDecryptionNonce: string;
    publicKey: string;
    encryptedSecretKey: string;
    secretKeyDecryptionNonce: string;
}

/**
 * Encrypted box result.
 */
export interface EncryptedBox {
    encryptedData: string;
    nonce: string;
}

/**
 * Encrypted blob result.
 */
export interface EncryptedBlob {
    encryptedData: string;
    decryptionHeader: string;
}

/**
 * Authenticator entity key from remote.
 */
export interface AuthenticatorEntityKey {
    encryptedKey: string;
    header: string;
}

/**
 * Match result for domain matching.
 */
export interface DomainMatch {
    code: Code;
    confidence: number;
}

/**
 * Custom domain mapping created by the user.
 */
export interface CustomDomainMapping {
    /** The domain to match, e.g., "mycompany.okta.com" */
    domain: string;
    /** The issuer name to match, e.g., "Okta - Work" (matches Code.issuer) */
    issuer: string;
    /** Timestamp when the mapping was created, for sorting */
    createdAt: number;
}

/**
 * MFA field detection result.
 */
export interface MFAFieldDetection {
    element: HTMLInputElement;
    confidence: number;
    type: "single" | "split";
    splitInputs?: HTMLInputElement[];
}

/**
 * SRP attributes returned by the server.
 */
export interface SRPAttributes {
    srpUserID: string;
    srpSalt: string;
    memLimit: number;
    opsLimit: number;
    kekSalt: string;
    isEmailMFAEnabled: boolean;
}

/**
 * Response from SRP verification.
 */
export interface SRPVerificationResponse {
    id: number;
    keyAttributes?: KeyAttributes;
    encryptedToken?: string;
    token?: string;
    srpM2: string;
    twoFactorSessionID?: string;
    passkeySessionID?: string;
    /**
     * Accounts app to verify the passkey on, sent with passkeySessionID. The
     * server picks it per user (accounts.ente.com, or accounts.ente.io for
     * passkeys registered before Ente's domain move).
     */
    accountsUrl?: string;
    twoFactorSessionIDV2?: string;
}

/**
 * Response from email verification.
 */
export interface EmailVerificationResponse {
    id: number;
    keyAttributes?: KeyAttributes;
    encryptedToken?: string;
    token?: string;
    twoFactorSessionID?: string;
    passkeySessionID?: string;
    /**
     * Accounts app to verify the passkey on, sent with passkeySessionID. The
     * server picks it per user (accounts.ente.com, or accounts.ente.io for
     * passkeys registered before Ente's domain move).
     */
    accountsUrl?: string;
    twoFactorSessionIDV2?: string;
}

/**
 * Response from two-factor authorization.
 */
export interface TwoFactorAuthorizationResponse {
    id: number;
    keyAttributes: KeyAttributes;
    encryptedToken: string;
}
