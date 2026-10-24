/**
 * Sync module for fetching and caching auth codes.
 */
import {
    APIError,
    getAuthCodes,
    getAuthenticatorEntityKey,
    createAuthenticatorEntityKey,
    createAuthenticatorEntity,
    updateAuthenticatorEntity,
    deleteAuthenticatorEntity,
} from "@shared/api";
import { codeToURIString } from "@shared/code";
import { decryptBox, encryptBox, encryptMetadataJSON, generateKey } from "@shared/crypto";
import type { Code, CodeFormData } from "@shared/types";
import { getToken, getMasterKey, isUnlocked } from "./auth";
import { codesStorage, settingsStorage } from "./storage";

/**
 * Sync codes from remote.
 */
export const syncCodes = async (): Promise<Code[]> => {
    const token = await getToken();
    const masterKey = await getMasterKey();

    if (!token || !masterKey) {
        console.log("Cannot sync: not logged in or vault locked");
        return [];
    }

    try {
        console.log("Syncing codes from remote...");
        const { codes, timeOffset } = await getAuthCodes(token, masterKey);

        // Cache the codes
        await codesStorage.setCodes(codes);

        // Store time offset for OTP generation
        if (timeOffset !== undefined) {
            await codesStorage.setTimeOffset(timeOffset);
        }

        // Update sync timestamp
        await codesStorage.setSyncTimestamp(Date.now());

        console.log(`Synced ${codes.length} codes`);
        return codes;
    } catch (e) {
        console.error("Failed to sync codes:", e);
        throw e;
    }
};

/**
 * Get cached codes, syncing if necessary.
 */
export const getCodes = async (forceSync = false): Promise<Code[]> => {
    if (!(await isUnlocked())) {
        return [];
    }

    // Check if we need to sync
    const lastSync = await codesStorage.getSyncTimestamp();
    const settings = await settingsStorage.getSettings();
    const syncIntervalMs = settings.syncInterval * 60 * 1000;
    const needsSync =
        forceSync || !lastSync || Date.now() - lastSync > syncIntervalMs;

    if (needsSync) {
        try {
            return await syncCodes();
        } catch {
            // Fall back to cached codes if sync fails
            const cached = await codesStorage.getCodes();
            return cached || [];
        }
    }

    const cached = await codesStorage.getCodes();

    // If no cached codes but user is unlocked, try syncing
    // This handles race condition after login where poll detects
    // auth state before sync completes
    if (!cached || cached.length === 0) {
        try {
            return await syncCodes();
        } catch {
            return [];
        }
    }

    return cached;
};

/**
 * Get the time offset for OTP generation.
 */
export const getTimeOffset = async (): Promise<number> => {
    return codesStorage.getTimeOffset();
};

/**
 * Get the decrypted authenticator key.
 * Returns undefined if not logged in or key not available.
 *
 * A new Ente account has no authenticator key until a client creates one.
 * With `createIfMissing`, generate it the way Ente's apps do: a random
 * secretbox key, encrypted with the master key (issue #25).
 */
export const getAuthenticatorKey = async (
    { createIfMissing = false }: { createIfMissing?: boolean } = {}
): Promise<string | undefined> => {
    const token = await getToken();
    const masterKey = await getMasterKey();

    if (!token || !masterKey) {
        return undefined;
    }

    let entityKey = await getAuthenticatorEntityKey(token);
    if (!entityKey && createIfMissing) {
        const authenticatorKey = await generateKey();
        const { encryptedData, nonce } = await encryptBox(authenticatorKey, masterKey);
        try {
            await createAuthenticatorEntityKey(token, { encryptedKey: encryptedData, header: nonce });
            return authenticatorKey;
        } catch (e) {
            // Another device created the key first; use theirs
            if (!(e instanceof APIError && e.status === 409)) throw e;
            entityKey = await getAuthenticatorEntityKey(token);
        }
    }
    if (!entityKey) {
        return undefined;
    }

    return decryptBox(
        {
            encryptedData: entityKey.encryptedKey,
            nonce: entityKey.header,
        },
        masterKey
    );
};

/**
 * Create a new code.
 */
export const createCode = async (
    formData: CodeFormData
): Promise<{ id: string }> => {
    const token = await getToken();
    const authenticatorKey = await getAuthenticatorKey({ createIfMissing: true });

    if (!token || !authenticatorKey) {
        throw new Error("Not authenticated");
    }

    // Build the URI string from form data
    const uriString = codeToURIString(formData);

    // Encrypt the URI string
    const { encryptedData, decryptionHeader } = await encryptMetadataJSON(
        uriString,
        authenticatorKey
    );

    // Create the entity
    const result = await createAuthenticatorEntity(token, {
        encryptedData,
        header: decryptionHeader,
    });

    return result;
};

/**
 * Update an existing code.
 */
export const updateCode = async (
    id: string,
    formData: CodeFormData
): Promise<void> => {
    const token = await getToken();
    const authenticatorKey = await getAuthenticatorKey();

    if (!token || !authenticatorKey) {
        throw new Error("Not authenticated");
    }

    // Build the URI string from form data
    const uriString = codeToURIString(formData);

    // Encrypt the URI string
    const { encryptedData, decryptionHeader } = await encryptMetadataJSON(
        uriString,
        authenticatorKey
    );

    // Update the entity
    await updateAuthenticatorEntity(token, {
        id,
        encryptedData,
        header: decryptionHeader,
    });
};

/**
 * Delete a code.
 */
export const deleteCode = async (id: string): Promise<void> => {
    const token = await getToken();

    if (!token) {
        throw new Error("Not authenticated");
    }

    await deleteAuthenticatorEntity(token, id);
};
