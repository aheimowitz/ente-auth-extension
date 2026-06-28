/**
 * Authentication management for the extension.
 */
import { deriveKey, decryptBoxBytes, decryptBox, encryptBox, generateSalt, fromB64, toB64 } from "@shared/crypto";
import type { AuthState, KeyAttributes } from "@shared/types";
import { authStorage, clearAllStorage, codesStorage, pinStorage } from "./storage";

// Argon2id interactive parameters — fast enough for UX, slow enough for brute-force cost
const PIN_OPS_LIMIT = 2; // crypto_pwhash_OPSLIMIT_INTERACTIVE
const PIN_MEM_LIMIT = 67108864; // crypto_pwhash_MEMLIMIT_INTERACTIVE (64 MB)

/**
 * Get the current authentication state.
 */
export const getAuthState = async (): Promise<AuthState> => {
    const [token, masterKey, email, hasPINValue] = await Promise.all([
        authStorage.getToken(),
        authStorage.getMasterKey(),
        authStorage.getEmail(),
        pinStorage.hasPIN(),
    ]);

    return {
        isLoggedIn: !!token,
        isUnlocked: !!masterKey,
        email,
        hasPIN: hasPINValue,
    };
};

/**
 * Store login credentials and key attributes.
 */
export const login = async (
    token: string,
    keyAttributes: KeyAttributes,
    email: string
): Promise<void> => {
    await authStorage.setToken(token);
    await authStorage.setKeyAttributes(keyAttributes);
    await authStorage.setEmail(email);
};

/**
 * Unlock the vault by deriving the master key from the password.
 */
export const unlock = async (password: string): Promise<boolean> => {
    const keyAttributes = await authStorage.getKeyAttributes();
    if (!keyAttributes) {
        throw new Error("No key attributes found. Please log in first.");
    }

    try {
        // Derive KEK (Key Encryption Key) from password
        const kek = await deriveKey(
            password,
            keyAttributes.kekSalt,
            keyAttributes.opsLimit,
            keyAttributes.memLimit
        );

        // Decrypt the master key using KEK
        const masterKeyBytes = await decryptBoxBytes(
            {
                encryptedData: keyAttributes.encryptedKey,
                nonce: keyAttributes.keyDecryptionNonce,
            },
            kek
        );

        const masterKey = await toB64(masterKeyBytes);

        // Verify by checking against the hash (optional, depends on backend)
        // For now, we assume successful decryption means correct password

        await authStorage.setMasterKey(masterKey);
        return true;
    } catch (e) {
        console.error("Failed to unlock:", e);
        return false;
    }
};

/**
 * Lock the vault (clear session data but keep credentials).
 */
export const lock = async (): Promise<void> => {
    await authStorage.clearMasterKey();
    await codesStorage.clearCodes();
};

/**
 * Log out completely (clear all data).
 */
export const logout = async (): Promise<void> => {
    await clearAllStorage();
};

/**
 * Check if the user is logged in.
 */
export const isLoggedIn = async (): Promise<boolean> => {
    const token = await authStorage.getToken();
    return !!token;
};

/**
 * Check if the vault is unlocked.
 */
export const isUnlocked = async (): Promise<boolean> => {
    const masterKey = await authStorage.getMasterKey();
    return !!masterKey;
};

/**
 * Get the auth token.
 */
export const getToken = async (): Promise<string | undefined> => {
    return authStorage.getToken();
};

/**
 * Get the master key.
 */
export const getMasterKey = async (): Promise<string | undefined> => {
    return authStorage.getMasterKey();
};

/**
 * Set a PIN for quick unlock. The vault must be unlocked first.
 * Encrypts the master key with a PIN-derived key and stores the result locally.
 */
export const setPin = async (pin: string): Promise<void> => {
    const masterKey = await authStorage.getMasterKey();
    if (!masterKey) throw new Error("Vault must be unlocked to set a PIN");

    const salt = await generateSalt();
    const pinKey = await deriveKey(pin, salt, PIN_OPS_LIMIT, PIN_MEM_LIMIT);
    const { encryptedData, nonce } = await encryptBox(masterKey, pinKey);
    await pinStorage.setPinData(encryptedData, nonce, salt);
};

/**
 * Remove the PIN. The vault remains unlocked; only the stored PIN data is cleared.
 */
export const removePin = async (): Promise<void> => {
    await pinStorage.clearPinData();
};

/**
 * Unlock the vault using the PIN.
 */
export const unlockWithPin = async (pin: string): Promise<boolean> => {
    const pinData = await pinStorage.getPinData();
    if (!pinData) return false;

    try {
        const pinKey = await deriveKey(pin, pinData.salt, PIN_OPS_LIMIT, PIN_MEM_LIMIT);
        const masterKey = await decryptBox(
            { encryptedData: pinData.encryptedData, nonce: pinData.nonce },
            pinKey
        );
        await authStorage.setMasterKey(masterKey);
        return true;
    } catch {
        return false;
    }
};

/**
 * Check whether a PIN is configured.
 */
export const hasPIN = async (): Promise<boolean> => {
    return pinStorage.hasPIN();
};
