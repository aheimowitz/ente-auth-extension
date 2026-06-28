/**
 * Browser storage abstraction.
 * Provides a unified interface for chrome.storage.local and chrome.storage.session.
 */
import { browser } from "@shared/browser";
import type { Code, CustomDomainMapping, ExtensionSettings, KeyAttributes, VaultTimeout } from "@shared/types";

// Storage keys
const KEYS = {
    // Local storage (persists across sessions)
    AUTH_TOKEN: "authToken",
    KEY_ATTRIBUTES: "keyAttributes",
    SETTINGS: "settings",
    SYNC_TIMESTAMP: "syncTimestamp",
    EMAIL: "email",
    CUSTOM_DOMAIN_MAPPINGS: "customDomainMappings",
    // Master key storage location depends on lockOnBrowserClose setting
    MASTER_KEY: "masterKey",
    MASTER_KEY_SESSION: "masterKeySession",
    // PIN-encrypted master key (local, persists)
    PIN_ENCRYPTED_DATA: "pinEncryptedData",
    PIN_NONCE: "pinNonce",
    PIN_SALT: "pinSalt",
    // Session storage (cleared on browser close)
    CODES_CACHE: "codesCache",
    TIME_OFFSET: "timeOffset",
} as const;

/**
 * Local storage operations (persistent).
 */
export const localStore = {
    async get<T>(key: string): Promise<T | undefined> {
        const result = await browser.storage.local.get(key);
        return result[key] as T | undefined;
    },

    async set(key: string, value: unknown): Promise<void> {
        await browser.storage.local.set({ [key]: value });
    },

    async remove(key: string): Promise<void> {
        await browser.storage.local.remove(key);
    },

    async clear(): Promise<void> {
        await browser.storage.local.clear();
    },
};

/**
 * Session storage operations (cleared on browser close).
 * Falls back to local storage if session storage is not available.
 */
export const sessionStore = {
    async get<T>(key: string): Promise<T | undefined> {
        // Check if session storage is available (Chrome MV3)
        if (browser.storage.session) {
            const result = await browser.storage.session.get(key);
            return result[key] as T | undefined;
        }
        // Fallback to local storage for Firefox MV2
        return localStore.get<T>(`session_${key}`);
    },

    async set(key: string, value: unknown): Promise<void> {
        if (browser.storage.session) {
            await browser.storage.session.set({ [key]: value });
        } else {
            await localStore.set(`session_${key}`, value);
        }
    },

    async remove(key: string): Promise<void> {
        if (browser.storage.session) {
            await browser.storage.session.remove(key);
        } else {
            await localStore.remove(`session_${key}`);
        }
    },

    async clear(): Promise<void> {
        if (browser.storage.session) {
            await browser.storage.session.clear();
        } else {
            // Clear session-prefixed items from local storage
            const items = await browser.storage.local.get(null);
            const sessionKeys = Object.keys(items).filter((k) =>
                k.startsWith("session_")
            );
            if (sessionKeys.length > 0) {
                await browser.storage.local.remove(sessionKeys);
            }
        }
    },
};

/**
 * Auth token storage.
 */
export const authStorage = {
    async getToken(): Promise<string | undefined> {
        return localStore.get<string>(KEYS.AUTH_TOKEN);
    },

    async setToken(token: string): Promise<void> {
        await localStore.set(KEYS.AUTH_TOKEN, token);
    },

    async clearToken(): Promise<void> {
        await localStore.remove(KEYS.AUTH_TOKEN);
    },

    async getKeyAttributes(): Promise<KeyAttributes | undefined> {
        return localStore.get<KeyAttributes>(KEYS.KEY_ATTRIBUTES);
    },

    async setKeyAttributes(attrs: KeyAttributes): Promise<void> {
        await localStore.set(KEYS.KEY_ATTRIBUTES, attrs);
    },

    async clearKeyAttributes(): Promise<void> {
        await localStore.remove(KEYS.KEY_ATTRIBUTES);
    },

    async getEmail(): Promise<string | undefined> {
        return localStore.get<string>(KEYS.EMAIL);
    },

    async setEmail(email: string): Promise<void> {
        await localStore.set(KEYS.EMAIL, email);
    },

    async clearEmail(): Promise<void> {
        await localStore.remove(KEYS.EMAIL);
    },

    async getMasterKey(): Promise<string | undefined> {
        // Check session storage first (for lockOnBrowserClose mode)
        const sessionKey = await sessionStore.get<string>(KEYS.MASTER_KEY_SESSION);
        if (sessionKey) {
            return sessionKey;
        }
        // Fall back to local storage (persistent mode)
        return localStore.get<string>(KEYS.MASTER_KEY);
    },

    async setMasterKey(key: string): Promise<void> {
        const settings = await settingsStorage.getSettings();
        if (settings.vaultTimeout !== "never") {
            // Any timeout setting: keep the live key in session storage so a
            // browser restart always requires re-unlock (via PIN or password)
            await sessionStore.set(KEYS.MASTER_KEY_SESSION, key);
            await localStore.remove(KEYS.MASTER_KEY);
        } else {
            await localStore.set(KEYS.MASTER_KEY, key);
            await sessionStore.remove(KEYS.MASTER_KEY_SESSION);
        }
    },

    async clearMasterKey(): Promise<void> {
        // Clear from both locations
        await localStore.remove(KEYS.MASTER_KEY);
        await sessionStore.remove(KEYS.MASTER_KEY_SESSION);
    },
};

/**
 * Codes cache storage.
 */
export const codesStorage = {
    async getCodes(): Promise<Code[] | undefined> {
        return sessionStore.get<Code[]>(KEYS.CODES_CACHE);
    },

    async setCodes(codes: Code[]): Promise<void> {
        await sessionStore.set(KEYS.CODES_CACHE, codes);
    },

    async clearCodes(): Promise<void> {
        await sessionStore.remove(KEYS.CODES_CACHE);
    },

    async getTimeOffset(): Promise<number> {
        return (await sessionStore.get<number>(KEYS.TIME_OFFSET)) ?? 0;
    },

    async setTimeOffset(offset: number): Promise<void> {
        await sessionStore.set(KEYS.TIME_OFFSET, offset);
    },

    async getSyncTimestamp(): Promise<number | undefined> {
        return localStore.get<number>(KEYS.SYNC_TIMESTAMP);
    },

    async setSyncTimestamp(timestamp: number): Promise<void> {
        await localStore.set(KEYS.SYNC_TIMESTAMP, timestamp);
    },
};

/**
 * Settings storage.
 */
export const settingsStorage = {
    async getSettings(): Promise<ExtensionSettings> {
        const stored = await localStore.get<Partial<ExtensionSettings> & { lockOnBrowserClose?: boolean }>(
            KEYS.SETTINGS
        );
        // Migrate from old autofillEnabled setting if present
        const legacyAutofill = (stored as Record<string, unknown>)?.autofillEnabled as boolean | undefined;
        const showAutofillIcon = stored?.showAutofillIcon ?? legacyAutofill ?? true;
        const autoFillSingleMatch = stored?.autoFillSingleMatch ?? legacyAutofill ?? true;

        // Migrate from old lockOnBrowserClose boolean to vaultTimeout
        let vaultTimeout: VaultTimeout = stored?.vaultTimeout ?? "never";
        if (!stored?.vaultTimeout && stored?.lockOnBrowserClose) {
            vaultTimeout = "onRestart";
        }

        return {
            showAutofillIcon,
            autoFillSingleMatch,
            syncInterval: stored?.syncInterval ?? 5,
            theme: stored?.theme ?? "system",
            vaultTimeout,
            serverUrl: stored?.serverUrl ?? "",
            accountsUrl: stored?.accountsUrl ?? "",
            sortOrder: stored?.sortOrder ?? "issuer",
        };
    },

    async setSettings(settings: Partial<ExtensionSettings>): Promise<void> {
        const current = await this.getSettings();
        await localStore.set(KEYS.SETTINGS, { ...current, ...settings });
    },

    async clearSettings(): Promise<void> {
        await localStore.remove(KEYS.SETTINGS);
    },
};

/**
 * PIN-encrypted master key storage.
 */
export const pinStorage = {
    async setPinData(encryptedData: string, nonce: string, salt: string): Promise<void> {
        await Promise.all([
            localStore.set(KEYS.PIN_ENCRYPTED_DATA, encryptedData),
            localStore.set(KEYS.PIN_NONCE, nonce),
            localStore.set(KEYS.PIN_SALT, salt),
        ]);
    },

    async getPinData(): Promise<{ encryptedData: string; nonce: string; salt: string } | null> {
        const [encryptedData, nonce, salt] = await Promise.all([
            localStore.get<string>(KEYS.PIN_ENCRYPTED_DATA),
            localStore.get<string>(KEYS.PIN_NONCE),
            localStore.get<string>(KEYS.PIN_SALT),
        ]);
        if (!encryptedData || !nonce || !salt) return null;
        return { encryptedData, nonce, salt };
    },

    async hasPIN(): Promise<boolean> {
        const data = await localStore.get<string>(KEYS.PIN_ENCRYPTED_DATA);
        return !!data;
    },

    async clearPinData(): Promise<void> {
        await Promise.all([
            localStore.remove(KEYS.PIN_ENCRYPTED_DATA),
            localStore.remove(KEYS.PIN_NONCE),
            localStore.remove(KEYS.PIN_SALT),
        ]);
    },
};

/**
 * Custom domain mappings storage.
 */
export const customMappingsStorage = {
    async getMappings(): Promise<CustomDomainMapping[]> {
        const mappings = await localStore.get<CustomDomainMapping[]>(
            KEYS.CUSTOM_DOMAIN_MAPPINGS
        );
        return mappings ?? [];
    },

    async addMapping(mapping: Omit<CustomDomainMapping, "createdAt">): Promise<void> {
        const mappings = await this.getMappings();
        // Remove existing mapping for this domain if it exists (update case)
        const filtered = mappings.filter(
            (m) => m.domain.toLowerCase() !== mapping.domain.toLowerCase()
        );
        // Add new mapping with timestamp
        const newMapping: CustomDomainMapping = {
            ...mapping,
            createdAt: Date.now(),
        };
        filtered.push(newMapping);
        await localStore.set(KEYS.CUSTOM_DOMAIN_MAPPINGS, filtered);
    },

    async deleteMapping(domain: string): Promise<void> {
        const mappings = await this.getMappings();
        const filtered = mappings.filter(
            (m) => m.domain.toLowerCase() !== domain.toLowerCase()
        );
        await localStore.set(KEYS.CUSTOM_DOMAIN_MAPPINGS, filtered);
    },

    async clearMappings(): Promise<void> {
        await localStore.remove(KEYS.CUSTOM_DOMAIN_MAPPINGS);
    },
};

/**
 * Clear all storage on logout.
 */
export const clearAllStorage = async (): Promise<void> => {
    await sessionStore.clear();
    await localStore.clear();
};
