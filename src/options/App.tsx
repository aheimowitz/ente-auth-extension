/**
 * Options page application component.
 */
import React, { useEffect, useState, useMemo } from "react";
import { browser, sendMessage } from "@shared/browser";
import { useTheme } from "@shared/useTheme";
import { getBuiltInMappings } from "@shared/domain-matcher";
import type { AuthState, Code, CustomDomainMapping, ExtensionSettings, ThemeMode } from "@shared/types";

/**
 * Get the extension version from the manifest.
 */
const getExtensionVersion = (): string => {
    try {
        return browser.runtime.getManifest().version;
    } catch {
        return "1.0.0";
    }
};

export const App: React.FC = () => {
    // Initialize theme
    useTheme();

    const [settings, setSettings] = useState<ExtensionSettings | null>(null);
    const [authState, setAuthState] = useState<AuthState | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loggingOut, setLoggingOut] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncSuccess, setSyncSuccess] = useState(false);

    // Domain mappings state
    const [customMappings, setCustomMappings] = useState<CustomDomainMapping[]>([]);
    const [codes, setCodes] = useState<Code[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newMappingDomain, setNewMappingDomain] = useState("");
    const [newMappingIssuer, setNewMappingIssuer] = useState("");
    const [addingMapping, setAddingMapping] = useState(false);
    const [showBuiltIn, setShowBuiltIn] = useState(false);
    const [builtInSearch, setBuiltInSearch] = useState("");
    const [expandedBuiltIn, setExpandedBuiltIn] = useState<string | null>(null);

    // Load settings, auth state, and mappings on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const [settingsResponse, authResponse, mappingsResponse, codesResponse] = await Promise.all([
                    sendMessage<{ success: boolean; data?: ExtensionSettings }>({
                        type: "GET_SETTINGS",
                    }),
                    sendMessage<{ success: boolean; data?: AuthState }>({
                        type: "GET_AUTH_STATE",
                    }),
                    sendMessage<{ success: boolean; data?: CustomDomainMapping[] }>({
                        type: "GET_CUSTOM_MAPPINGS",
                    }),
                    sendMessage<{ success: boolean; data?: { codes: Code[] } }>({
                        type: "GET_CODES",
                    }),
                ]);

                if (settingsResponse.success && settingsResponse.data) {
                    setSettings(settingsResponse.data);
                }
                if (authResponse.success && authResponse.data) {
                    setAuthState(authResponse.data);
                }
                if (mappingsResponse.success && mappingsResponse.data) {
                    setCustomMappings(mappingsResponse.data);
                }
                if (codesResponse.success && codesResponse.data?.codes) {
                    setCodes(codesResponse.data.codes);
                }
            } catch (e) {
                console.error("Failed to load data:", e);
            }
        };

        loadData();
    }, []);

    // Handle logout
    const handleLogout = async () => {
        setLoggingOut(true);
        try {
            await sendMessage({ type: "LOGOUT" });
            setAuthState({ isLoggedIn: false, isUnlocked: false });
        } catch (e) {
            console.error("Failed to logout:", e);
        } finally {
            setLoggingOut(false);
        }
    };

    // Handle manual sync
    const handleSync = async () => {
        setSyncing(true);
        setSyncSuccess(false);
        try {
            await sendMessage({ type: "SYNC_CODES" });
            setSyncSuccess(true);
            setTimeout(() => setSyncSuccess(false), 2000);
        } catch (e) {
            console.error("Failed to sync:", e);
        } finally {
            setSyncing(false);
        }
    };

    // Save settings
    const saveSettings = async (newSettings: Partial<ExtensionSettings>) => {
        setSaving(true);
        setSaved(false);
        setError(null);

        try {
            const response = await sendMessage<{
                success: boolean;
                error?: string;
            }>({
                type: "SET_SETTINGS",
                settings: newSettings,
            });

            if (response.success) {
                setSettings((prev) =>
                    prev ? { ...prev, ...newSettings } : null
                );
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            } else {
                setError(response.error || "Failed to save settings");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    // Handle toggle change
    const handleToggle = (key: keyof ExtensionSettings) => {
        if (!settings) return;
        const newValue = !settings[key];
        saveSettings({ [key]: newValue });
    };

    // Handle theme change with page reload to apply new theme
    const handleThemeChange = (theme: ThemeMode) => {
        saveSettings({ theme }).then(() => {
            // Reload the page to apply the new theme
            window.location.reload();
        });
    };

    // Add custom mapping
    const handleAddMapping = async () => {
        if (!newMappingDomain.trim() || !newMappingIssuer) return;

        setAddingMapping(true);
        try {
            const response = await sendMessage<{ success: boolean; error?: string }>({
                type: "ADD_CUSTOM_MAPPING",
                mapping: {
                    domain: newMappingDomain.trim().toLowerCase(),
                    issuer: newMappingIssuer,
                },
            });

            if (response.success) {
                // Refresh mappings list
                const mappingsResponse = await sendMessage<{
                    success: boolean;
                    data?: CustomDomainMapping[];
                }>({ type: "GET_CUSTOM_MAPPINGS" });

                if (mappingsResponse.success && mappingsResponse.data) {
                    setCustomMappings(mappingsResponse.data);
                }

                setNewMappingDomain("");
                setNewMappingIssuer("");
                setShowAddForm(false);
            } else {
                setError(response.error || "Failed to add mapping");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to add mapping");
        } finally {
            setAddingMapping(false);
        }
    };

    // Delete custom mapping
    const handleDeleteMapping = async (domain: string) => {
        try {
            const response = await sendMessage<{ success: boolean; error?: string }>({
                type: "DELETE_CUSTOM_MAPPING",
                domain,
            });

            if (response.success) {
                setCustomMappings((prev) =>
                    prev.filter((m) => m.domain.toLowerCase() !== domain.toLowerCase())
                );
            } else {
                setError(response.error || "Failed to delete mapping");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete mapping");
        }
    };

    // Filter built-in mappings based on search
    const builtInMappings = getBuiltInMappings();
    const filteredBuiltInMappings = useMemo(() => {
        if (!builtInSearch.trim()) return Object.entries(builtInMappings);

        const query = builtInSearch.toLowerCase();
        return Object.entries(builtInMappings).filter(([issuer, domains]) => {
            return (
                issuer.toLowerCase().includes(query) ||
                domains.some((d) => d.toLowerCase().includes(query))
            );
        });
    }, [builtInMappings, builtInSearch]);

    // Get unique issuers from codes for dropdown
    const uniqueIssuers = useMemo(() => {
        const issuers = new Set<string>();
        codes.forEach((code) => issuers.add(code.issuer));
        return Array.from(issuers).sort((a, b) => a.localeCompare(b));
    }, [codes]);

    if (!settings) {
        return (
            <div className="options-container">
                <div className="loading">Loading settings...</div>
            </div>
        );
    }

    return (
        <div className="options-container">
            <div className="options-header">
                <Logo />
                <h1>Ente Auth Extension Settings</h1>
            </div>

            <div className="options-content">
                <section className="settings-section">
                    <h2>Appearance</h2>

                    <div className="setting-item">
                        <div className="setting-info">
                            <label>Theme</label>
                            <p>
                                Choose your preferred color scheme.
                            </p>
                        </div>
                        <select
                            value={settings.theme}
                            onChange={(e) =>
                                handleThemeChange(e.target.value as ThemeMode)
                            }
                            className="select-input"
                        >
                            <option value="system">System</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                    </div>
                </section>

                <section className="settings-section">
                    <h2>Autofill</h2>

                    <div className="setting-item">
                        <div className="setting-info">
                            <label>Show autofill icon</label>
                            <p>
                                Display the autofill icon on detected MFA input fields.
                            </p>
                        </div>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={settings.showAutofillIcon}
                                onChange={() =>
                                    handleToggle("showAutofillIcon")
                                }
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>

                    <div className="setting-item">
                        <div className="setting-info">
                            <label>Auto-fill single match</label>
                            <p>
                                Automatically fill and submit when only one code matches.
                            </p>
                        </div>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={settings.autoFillSingleMatch}
                                onChange={() =>
                                    handleToggle("autoFillSingleMatch")
                                }
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>
                </section>

                <section className="settings-section">
                    <h2>Security</h2>

                    <div className="setting-item">
                        <div className="setting-info">
                            <label>Lock on browser close</label>
                            <p>
                                Require password when the browser restarts.
                            </p>
                        </div>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={settings.lockOnBrowserClose}
                                onChange={() =>
                                    handleToggle("lockOnBrowserClose")
                                }
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>
                </section>

                <section className="settings-section">
                    <h2>Domain Mappings</h2>
                    <p className="section-description">
                        Custom mappings help match websites to your codes when automatic detection doesn't work.
                    </p>

                    {/* Custom Mappings */}
                    <div className="mappings-subsection">
                        <h3>Custom Mappings</h3>

                        {customMappings.length === 0 && !showAddForm ? (
                            <p className="empty-state">No custom mappings yet.</p>
                        ) : (
                            <div className="mappings-list">
                                {customMappings
                                    .sort((a, b) => b.createdAt - a.createdAt)
                                    .map((mapping) => (
                                        <div key={mapping.domain} className="mapping-item">
                                            <div className="mapping-info">
                                                <span className="mapping-domain">{mapping.domain}</span>
                                                <span className="mapping-arrow">→</span>
                                                <span className="mapping-issuer">{mapping.issuer}</span>
                                            </div>
                                            <button
                                                className="delete-button"
                                                onClick={() => handleDeleteMapping(mapping.domain)}
                                                title="Delete mapping"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                            </div>
                        )}

                        {showAddForm ? (
                            <div className="add-mapping-form">
                                <div className="form-row">
                                    <input
                                        type="text"
                                        placeholder="Domain (e.g., mycompany.okta.com)"
                                        value={newMappingDomain}
                                        onChange={(e) => setNewMappingDomain(e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-row">
                                    <select
                                        value={newMappingIssuer}
                                        onChange={(e) => setNewMappingIssuer(e.target.value)}
                                        className="form-select"
                                    >
                                        <option value="">Select a code...</option>
                                        {uniqueIssuers.map((issuer) => (
                                            <option key={issuer} value={issuer}>
                                                {issuer}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-actions">
                                    <button
                                        className="cancel-button"
                                        onClick={() => {
                                            setShowAddForm(false);
                                            setNewMappingDomain("");
                                            setNewMappingIssuer("");
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="save-button"
                                        onClick={handleAddMapping}
                                        disabled={
                                            addingMapping ||
                                            !newMappingDomain.trim() ||
                                            !newMappingIssuer
                                        }
                                    >
                                        {addingMapping ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                className="add-mapping-button"
                                onClick={() => setShowAddForm(true)}
                            >
                                + Add Mapping
                            </button>
                        )}
                    </div>

                    {/* Built-in Mappings */}
                    <div className="mappings-subsection builtin">
                        <button
                            className="collapse-toggle"
                            onClick={() => setShowBuiltIn(!showBuiltIn)}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                style={{
                                    transform: showBuiltIn ? "rotate(90deg)" : "rotate(0deg)",
                                    transition: "transform 0.2s",
                                }}
                            >
                                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                            </svg>
                            <h3>Built-in Mappings ({Object.keys(builtInMappings).length})</h3>
                        </button>

                        {showBuiltIn && (
                            <>
                                <div className="search-box">
                                    <input
                                        type="text"
                                        placeholder="Search built-in mappings..."
                                        value={builtInSearch}
                                        onChange={(e) => setBuiltInSearch(e.target.value)}
                                        className="search-input"
                                    />
                                </div>
                                <div className="mappings-list builtin-list">
                                    {filteredBuiltInMappings.map(([issuer, domains]) => {
                                        const isExpanded = expandedBuiltIn === issuer;
                                        return (
                                            <div
                                                key={issuer}
                                                className={`mapping-item builtin ${isExpanded ? "expanded" : ""}`}
                                                onClick={() => setExpandedBuiltIn(isExpanded ? null : issuer)}
                                            >
                                                <div className="mapping-info">
                                                    <span className="mapping-issuer">{issuer}</span>
                                                    <span className="mapping-arrow">→</span>
                                                    {isExpanded ? (
                                                        <div className="mapping-domains-expanded">
                                                            {domains.map((domain) => (
                                                                <span key={domain} className="domain-tag">
                                                                    {domain}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="mapping-domains">
                                                            {domains.join(", ")}
                                                        </span>
                                                    )}
                                                </div>
                                                <svg
                                                    className="expand-icon"
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                    style={{
                                                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                                        transition: "transform 0.2s",
                                                    }}
                                                >
                                                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
                                                </svg>
                                            </div>
                                        );
                                    })}
                                    {filteredBuiltInMappings.length === 0 && (
                                        <p className="empty-state">No matches found.</p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </section>

                {authState?.isLoggedIn && (
                    <section className="settings-section">
                        <h2>Account</h2>

                        <div className="setting-item">
                            <div className="setting-info">
                                <label>Logged in as</label>
                                <p>{authState.email || "Unknown"}</p>
                            </div>
                            <button
                                className="logout-button"
                                onClick={handleLogout}
                                disabled={loggingOut}
                            >
                                {loggingOut ? "Logging out..." : "Log out"}
                            </button>
                        </div>

                        <div className="setting-item">
                            <div className="setting-info">
                                <label>Sync codes</label>
                                <p>
                                    Codes sync automatically every 5 minutes.
                                </p>
                            </div>
                            <button
                                className="sync-button"
                                onClick={handleSync}
                                disabled={syncing}
                            >
                                {syncing ? "Syncing..." : syncSuccess ? "Synced!" : "Sync now"}
                            </button>
                        </div>
                    </section>
                )}

                {(saving || saved || error) && (
                    <div className="status-bar">
                        {saving && <span className="saving">Saving...</span>}
                        {saved && <span className="saved">Settings saved!</span>}
                        {error && <span className="error">{error}</span>}
                    </div>
                )}
            </div>

            <div className="options-footer">
                <p>
                    Ente Auth Extension v{getExtensionVersion()} •{" "}
                    <a
                        href="https://github.com/aheimowitz/ente-auth-extension"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        GitHub
                    </a>
                    {" • "}
                    <a
                        href="https://ente.io"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        ente.io
                    </a>
                </p>
            </div>
        </div>
    );
};

// Logo component - Ente Auth purple
const Logo: React.FC = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
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
