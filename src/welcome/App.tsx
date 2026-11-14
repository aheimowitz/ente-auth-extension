/**
 * Getting started guide. Opens after the first login and is linked from the
 * settings page so it can be revisited. Walks the user through setting up
 * appearance, autofill behavior, vault locking and a PIN, then explains how
 * to fill codes, fix matching, report problems and get help.
 */
import React, { useEffect, useRef, useState } from "react";
import { browser, openOptionsPage, sendMessage } from "@shared/browser";
import { applyAccent, applyTheme, getSystemPreference, useTheme } from "@shared/useTheme";
import { NEW_ISSUE_URL, REPO_URL, getReviewUrl } from "@shared/links";
import type { AccentTheme, AuthState, ExtensionSettings, ThemeMode, VaultTimeout } from "@shared/types";
import { AccentPicker } from "../options/AccentPicker";

type SaveFn = (changes: Partial<ExtensionSettings>) => void;

const VAULT_TIMEOUT_LABELS: Record<VaultTimeout, string> = {
    never: "Never",
    onRestart: "On browser restart",
    onSystemLock: "On system lock",
    "5": "After 5 minutes",
    "15": "After 15 minutes",
    "60": "After 1 hour",
    "240": "After 4 hours",
};

interface StepDef {
    label: string;
    icon: React.ReactNode;
}

const STEPS: StepDef[] = [
    { label: "Welcome", icon: <KeyIcon /> },
    { label: "Appearance", icon: <PaletteIcon /> },
    { label: "Autofill", icon: <ShieldIcon /> },
    { label: "Security", icon: <LockIcon /> },
    { label: "Using Duckey", icon: <CursorIcon /> },
    { label: "Done", icon: <CheckIcon /> },
];

export const App: React.FC = () => {
    useTheme();

    const [step, setStep] = useState(0);
    const [settings, setSettings] = useState<ExtensionSettings | null>(null);
    const [authState, setAuthState] = useState<AuthState | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        sendMessage<{ success: boolean; data?: ExtensionSettings }>({ type: "GET_SETTINGS" })
            .then((res) => {
                if (res.success && res.data) setSettings(res.data);
            })
            .catch(console.error);
        sendMessage<{ success: boolean; data?: AuthState }>({ type: "GET_AUTH_STATE" })
            .then((res) => {
                if (res.success && res.data) setAuthState(res.data);
            })
            .catch(console.error);
    }, []);

    const save: SaveFn = async (changes) => {
        setError(null);
        const previous = settings;
        setSettings((prev) => (prev ? { ...prev, ...changes } : prev));
        try {
            const res = await sendMessage<{ success: boolean; error?: string }>({
                type: "SET_SETTINGS",
                settings: changes,
            });
            if (!res.success) throw new Error(res.error || "Failed to save");
        } catch (e) {
            setSettings(previous);
            setError(e instanceof Error ? e.message : "Failed to save");
        }
    };

    const goTo = (i: number) => {
        setStep(i);
        setError(null);
    };

    const isLast = step === STEPS.length - 1;
    const current = STEPS[step]!;

    return (
        <div className="welcome-page">
            <header className="welcome-topbar">
                <div className="welcome-brand">
                    <Logo />
                    <span>Duckey</span>
                </div>
                <button className="welcome-text-button" onClick={() => openOptionsPage().catch(console.error)}>
                    All settings
                </button>
            </header>

            <div className="welcome-progress">
                <div className="welcome-progress-meta">
                    <span>Set up Duckey</span>
                    <span>
                        Step {step + 1} of {STEPS.length}
                    </span>
                </div>
                <div className="welcome-progress-track" role="tablist" aria-label="Setup steps">
                    {STEPS.map((s, i) => (
                        <button
                            key={s.label}
                            role="tab"
                            aria-selected={i === step}
                            aria-label={s.label}
                            title={s.label}
                            className={`welcome-progress-segment${i <= step ? " filled" : ""}`}
                            onClick={() => goTo(i)}
                        />
                    ))}
                </div>
            </div>

            <main className="welcome-card" key={step}>
                <div className="welcome-step-icon" aria-hidden="true">
                    {current.icon}
                </div>
                <p className="welcome-eyebrow">{current.label}</p>

                {step === 0 && <WelcomeStep />}
                {step === 1 &&
                    (settings ? (
                        <AppearanceStep
                            settings={settings}
                            save={save}
                            setLocal={(changes) => setSettings((prev) => (prev ? { ...prev, ...changes } : prev))}
                        />
                    ) : (
                        <Loading />
                    ))}
                {step === 2 && (settings ? <AutofillStep settings={settings} save={save} /> : <Loading />)}
                {step === 3 &&
                    (settings ? (
                        <SecurityStep
                            settings={settings}
                            save={save}
                            authState={authState}
                            onPinSet={() => setAuthState((prev) => (prev ? { ...prev, hasPIN: true } : prev))}
                        />
                    ) : (
                        <Loading />
                    ))}
                {step === 4 && <UsingStep />}
                {step === 5 && <DoneStep settings={settings} authState={authState} />}

                {error && <p className="welcome-error">{error}</p>}

                <footer className="welcome-nav">
                    {step > 0 ? (
                        <button className="welcome-text-button" onClick={() => goTo(step - 1)}>
                            ← Back
                        </button>
                    ) : (
                        <span />
                    )}
                    {isLast ? (
                        <button className="welcome-button" onClick={closeTab}>
                            Finish
                        </button>
                    ) : (
                        <button className="welcome-button" onClick={() => goTo(step + 1)}>
                            {step === 0 ? "Let's set it up" : "Continue"}
                        </button>
                    )}
                </footer>
            </main>
        </div>
    );
};

const Loading: React.FC = () => <p className="welcome-fine">Loading settings...</p>;

const WelcomeStep: React.FC = () => (
    <>
        <h1>Your Ente Auth codes, right in the browser</h1>
        <p className="welcome-lead">
            Duckey fills your 2FA codes wherever you log in. Let's take a minute to set it up the way you like.
        </p>
        <ul className="welcome-points">
            <li>
                <strong>End-to-end encrypted.</strong> Codes are decrypted only on this device, and your password
                never leaves it.
            </li>
            <li>
                <strong>Always in sync.</strong> Changes in the Ente Auth app show up here within 5 minutes, and
                codes you add here show up in the app.
            </li>
        </ul>
        <p className="welcome-fine">
            Everything here can be changed later in Settings. Duckey is an independent, open-source project, not
            made by Ente.
        </p>
    </>
);

const AppearanceStep: React.FC<{
    settings: ExtensionSettings;
    save: SaveFn;
    setLocal: (changes: Partial<ExtensionSettings>) => void;
}> = ({ settings, save, setLocal }) => {
    const accentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const setTheme = (theme: ThemeMode) => {
        applyTheme(theme === "system" ? getSystemPreference() : theme);
        save({ theme });
    };
    const setAccent = (accentTheme: AccentTheme, accentCustomColor: string) => {
        // Apply live, save once the user pauses (the color picker fires
        // continuously while dragging)
        applyAccent(accentTheme, accentCustomColor);
        setLocal({ accentTheme, accentCustomColor });
        clearTimeout(accentTimer.current);
        accentTimer.current = setTimeout(() => save({ accentTheme, accentCustomColor }), 400);
    };

    return (
        <>
            <h1>Make it yours</h1>
            <p className="welcome-lead">Pick a theme and an accent color. You'll see them change right here.</p>
            <div className="welcome-group">
                <div className="welcome-row">
                    <div className="welcome-row-text">
                        <label>Theme</label>
                        <span>System follows your device setting</span>
                    </div>
                    <div className="welcome-segmented" role="radiogroup" aria-label="Theme">
                        {(["system", "light", "dark"] as ThemeMode[]).map((t) => (
                            <button
                                key={t}
                                role="radio"
                                aria-checked={settings.theme === t}
                                className={settings.theme === t ? "selected" : ""}
                                onClick={() => setTheme(t)}
                            >
                                {t[0]!.toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="welcome-row">
                    <div className="welcome-row-text">
                        <label>Accent color</label>
                        <span>Duckey green, Ente purple, or your own</span>
                    </div>
                    <AccentPicker
                        accent={settings.accentTheme}
                        customColor={settings.accentCustomColor}
                        onChange={setAccent}
                    />
                </div>
            </div>
        </>
    );
};

type AutofillMode = "fast" | "careful" | "custom";

const getAutofillMode = (s: ExtensionSettings): AutofillMode => {
    if (s.autoFillSingleMatch && s.autoSubmit) return "fast";
    if (!s.autoFillSingleMatch && !s.autoSubmit) return "careful";
    return "custom";
};

const AutofillStep: React.FC<{ settings: ExtensionSettings; save: SaveFn }> = ({ settings, save }) => {
    const mode = getAutofillMode(settings);
    const [showDetails, setShowDetails] = useState(mode === "custom");

    return (
        <>
            <h1>How hands-off should autofill be?</h1>
            <p className="welcome-lead">
                Duckey can fill and submit codes on its own, or let you check each one first.
            </p>

            <div className="welcome-choices" role="radiogroup" aria-label="Autofill mode">
                <ChoiceCard
                    selected={mode === "fast"}
                    title="Fast"
                    badge="Default"
                    description="When exactly one code matches, fill it and submit the form automatically."
                    onSelect={() => save({ autoFillSingleMatch: true, autoSubmit: true })}
                />
                <ChoiceCard
                    selected={mode === "careful"}
                    title="Careful"
                    description="Show the matching codes so you pick one, then press the site's button yourself."
                    onSelect={() => save({ autoFillSingleMatch: false, autoSubmit: false })}
                />
            </div>

            <div className="welcome-callout">
                Matching goes by the site's name, so a look-alike phishing site can match too. A code lasts about
                30 seconds and is useless without your password, but a phishing page that already has your password
                could use it. <strong>Careful</strong> gives you a chance to check the address first.
            </div>

            <button className="welcome-disclosure" onClick={() => setShowDetails(!showDetails)} aria-expanded={showDetails}>
                <span className={`welcome-chevron${showDetails ? " open" : ""}`}>›</span>
                Fine-tune{mode === "custom" ? " (custom settings)" : ""}
            </button>
            {showDetails && (
                <div className="welcome-group">
                    <ToggleRow
                        label="Show autofill icon"
                        description="Add the Duckey icon to detected 2FA code fields."
                        checked={settings.showAutofillIcon}
                        onChange={() => save({ showAutofillIcon: !settings.showAutofillIcon })}
                    />
                    <ToggleRow
                        label="Auto-fill single match"
                        description="Fill by itself when only one code matches."
                        checked={settings.autoFillSingleMatch}
                        onChange={() => save({ autoFillSingleMatch: !settings.autoFillSingleMatch })}
                    />
                    <ToggleRow
                        label="Auto-submit forms"
                        description="Submit right after a code is filled."
                        checked={settings.autoSubmit}
                        onChange={() => save({ autoSubmit: !settings.autoSubmit })}
                    />
                </div>
            )}
        </>
    );
};

const SecurityStep: React.FC<{
    settings: ExtensionSettings;
    save: SaveFn;
    authState: AuthState | null;
    onPinSet: () => void;
}> = ({ settings, save, authState, onPinSet }) => {
    const [pin, setPin] = useState("");
    const [confirm, setConfirm] = useState("");
    const [lockOnRestart, setLockOnRestart] = useState(true);
    const [pinError, setPinError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    const hasPIN = !!authState?.hasPIN;
    const canSetPin = !!authState?.isUnlocked;

    const submitPin = async () => {
        setPinError(null);
        if (pin.length < 4) {
            setPinError("PIN must be at least 4 digits");
            return;
        }
        if (pin !== confirm) {
            setPinError("PINs don't match");
            return;
        }
        setSaving(true);
        try {
            const res = await sendMessage<{ success: boolean; error?: string }>({
                type: "SET_PIN",
                pin,
                lockOnRestart,
            });
            if (!res.success) throw new Error(res.error || "Failed to set PIN");
            setPin("");
            setConfirm("");
            setEditing(false);
            onPinSet();
        } catch (e) {
            setPinError(e instanceof Error ? e.message : "Failed to set PIN");
        } finally {
            setSaving(false);
        }
    };

    const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 8);

    return (
        <>
            <h1>Lock it down</h1>
            <p className="welcome-lead">
                A locked vault can't show or fill codes until you unlock it. Choose when it locks, and set a PIN so
                unlocking is quick.
            </p>

            <div className="welcome-group">
                <div className="welcome-row">
                    <div className="welcome-row-text">
                        <label htmlFor="welcome-vault-timeout">Lock automatically</label>
                        <span>You can always lock it from the popup</span>
                    </div>
                    <select
                        id="welcome-vault-timeout"
                        className="select-input"
                        value={settings.vaultTimeout}
                        onChange={(e) => save({ vaultTimeout: e.target.value as VaultTimeout })}
                    >
                        {(Object.keys(VAULT_TIMEOUT_LABELS) as VaultTimeout[]).map((v) => (
                            <option key={v} value={v}>
                                {VAULT_TIMEOUT_LABELS[v]}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="welcome-pin">
                <div className="welcome-pin-header">
                    <div className="welcome-row-text">
                        <label>Unlock with a PIN</label>
                        <span>
                            Instead of your full Ente password. The PIN stays on this device, and your password always
                            works too.
                        </span>
                    </div>
                    {hasPIN && !editing && <span className="welcome-badge">PIN set</span>}
                </div>

                {!canSetPin ? (
                    <p className="welcome-fine">Unlock Duckey from the toolbar popup to set a PIN.</p>
                ) : hasPIN && !editing ? (
                    <button className="welcome-button secondary small" onClick={() => setEditing(true)}>
                        Change PIN
                    </button>
                ) : (
                    <>
                        <div className="welcome-pin-fields">
                            <input
                                type="password"
                                inputMode="numeric"
                                className="form-input"
                                placeholder="PIN (4–8 digits)"
                                aria-label="PIN"
                                value={pin}
                                onChange={(e) => setPin(digitsOnly(e.target.value))}
                                autoComplete="new-password"
                            />
                            <input
                                type="password"
                                inputMode="numeric"
                                className="form-input"
                                placeholder="Confirm PIN"
                                aria-label="Confirm PIN"
                                value={confirm}
                                onChange={(e) => setConfirm(digitsOnly(e.target.value))}
                                onKeyDown={(e) => e.key === "Enter" && submitPin()}
                                autoComplete="new-password"
                            />
                        </div>
                        <label className="welcome-check">
                            <input
                                type="checkbox"
                                checked={lockOnRestart}
                                onChange={(e) => setLockOnRestart(e.target.checked)}
                            />
                            <span>Ask for my password after a browser restart (recommended)</span>
                        </label>
                        {pinError && <p className="welcome-error">{pinError}</p>}
                        <div className="welcome-pin-actions">
                            {editing && (
                                <button className="welcome-text-button" onClick={() => setEditing(false)}>
                                    Cancel
                                </button>
                            )}
                            <button
                                className="welcome-button small"
                                onClick={submitPin}
                                disabled={saving || pin.length < 4}
                            >
                                {saving ? "Saving..." : "Set PIN"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
};

const UsingStep: React.FC = () => (
    <>
        <h1>Three ways to fill a code</h1>
        <div className="welcome-tiles">
            <div className="welcome-tile">
                <h3>On the page</h3>
                <p>Duckey adds its icon to 2FA code fields. Click it to pick a code.</p>
            </div>
            <div className="welcome-tile">
                <h3>From the toolbar</h3>
                <p>Search, copy, add and edit codes, or scan a QR code showing on the current page.</p>
            </div>
            <div className="welcome-tile">
                <h3>Right-click</h3>
                <p>
                    Field not detected? Right-click it and choose <em>Fill code with Duckey</em>.
                </p>
            </div>
        </div>

        <h3 className="welcome-subheading">Wrong code, or none?</h3>
        <p>
            Duckey matches the site's address to your codes' names. If it picks wrong, add a{" "}
            <strong>custom mapping</strong> in Settings → Domain Mappings with just the domain, like{" "}
            <code>example.com</code> (that covers its subdomains too).
        </p>

        <div className="welcome-callout report">
            <strong>Still not working on a site?</strong> Right-click the code field and choose{" "}
            <em>Report a problem with this field</em>, or right-click the Duckey toolbar icon and choose{" "}
            <em>Report a problem on this page</em>. Duckey gathers the technical details, you check them, and it
            opens a ready-to-submit GitHub issue.
        </div>

        <p className="welcome-fine">
            Tip: pin Duckey from your browser's extensions menu (the puzzle piece) so it's one click away.
        </p>
    </>
);

const DoneStep: React.FC<{ settings: ExtensionSettings | null; authState: AuthState | null }> = ({
    settings,
    authState,
}) => {
    const mode = settings ? getAutofillMode(settings) : null;
    return (
        <>
            <h1>You're all set</h1>
            {settings && (
                <div className="welcome-group">
                    <div className="welcome-row">
                        <span className="welcome-summary-label">Autofill</span>
                        <span>{mode === "fast" ? "Fast" : mode === "careful" ? "Careful" : "Custom"}</span>
                    </div>
                    <div className="welcome-row">
                        <span className="welcome-summary-label">Vault locks</span>
                        <span>{VAULT_TIMEOUT_LABELS[settings.vaultTimeout]}</span>
                    </div>
                    <div className="welcome-row">
                        <span className="welcome-summary-label">PIN unlock</span>
                        <span>{authState?.hasPIN ? "On" : "Off"}</span>
                    </div>
                </div>
            )}
            <p>
                If a site doesn't work, the quickest way to report it is to right-click the field and choose{" "}
                <em>Report a problem with this field</em>. For anything else, open an issue on GitHub.
            </p>
            <div className="welcome-links">
                <a className="welcome-button secondary small" href={NEW_ISSUE_URL} target="_blank" rel="noopener noreferrer">
                    Report an issue
                </a>
                <a className="welcome-button secondary small" href={REPO_URL} target="_blank" rel="noopener noreferrer">
                    View on GitHub
                </a>
            </div>
            <div className="welcome-review">
                <div>
                    <h3>Enjoying Duckey?</h3>
                    <p>A quick store review helps a small project and helps other Ente users find it.</p>
                </div>
                <a className="welcome-button" href={getReviewUrl()} target="_blank" rel="noopener noreferrer">
                    Leave a review
                </a>
            </div>
        </>
    );
};

const ChoiceCard: React.FC<{
    selected: boolean;
    title: string;
    badge?: string;
    description: string;
    onSelect: () => void;
}> = ({ selected, title, badge, description, onSelect }) => (
    <button
        role="radio"
        aria-checked={selected}
        className={`welcome-choice${selected ? " selected" : ""}`}
        onClick={onSelect}
    >
        <span className="welcome-choice-title">
            <span className="welcome-radio" aria-hidden="true" />
            {title}
            {badge && <span className="welcome-choice-badge">{badge}</span>}
        </span>
        <span className="welcome-choice-text">{description}</span>
    </button>
);

const ToggleRow: React.FC<{
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
}> = ({ label, description, checked, onChange }) => (
    <div className="welcome-row">
        <div className="welcome-row-text">
            <label>{label}</label>
            <span>{description}</span>
        </div>
        <label className="toggle">
            <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
            <span className="toggle-slider"></span>
        </label>
    </div>
);

// tabs.remove also works when the tab wasn't opened by script (e.g. a link
// from the settings page), where window.close() is refused
const closeTab = (): void => {
    browser.tabs
        .getCurrent()
        .then((tab) => (tab?.id !== undefined ? browser.tabs.remove(tab.id) : window.close()))
        .catch(() => window.close());
};

// Duckey duck-key mark (same as the settings page)
function Logo(): React.ReactElement {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect width="24" height="24" rx="5.25" style={{ fill: "var(--accent)" }} />
            <path d="M6.75 10.5C4.13 9.94 1.69 10.5 1.69 12C1.69 13.5 4.13 14.06 6.75 13.5Z" fill="#F7A325" />
            <path d="M11.25 10.31H21A.75.75 0 0 1 21.75 11.06V12.56A.75.75 0 0 1 21 13.31H20.25V15.75A.56.56 0 0 1 19.69 16.31H18.56A.56.56 0 0 1 18 15.75V13.31H16.88V14.81A.56.56 0 0 1 16.31 15.38H15.19A.56.56 0 0 1 14.63 14.81V13.31H11.25Z" fill="#FFF6E0" />
            <circle cx="9" cy="11.81" r="5.06" fill="#FFF6E0" />
            <circle cx="9.38" cy="10.31" r="0.94" fill="#0A5048" />
        </svg>
    );
}

// Step icons (24px outline set)
function Icon({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {children}
        </svg>
    );
}

function KeyIcon(): React.ReactElement {
    return (
        <Icon>
            <circle cx="8" cy="15" r="4" />
            <path d="M10.85 12.15 19 4M17 6l2 2M14 9l2 2" />
        </Icon>
    );
}

function PaletteIcon(): React.ReactElement {
    return (
        <Icon>
            <path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.6-.9 1.2-1.8-.4-.9.1-2.2 1.3-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" />
            <circle cx="7.5" cy="11" r="1" />
            <circle cx="10.5" cy="7" r="1" />
            <circle cx="15" cy="8" r="1" />
        </Icon>
    );
}

function CursorIcon(): React.ReactElement {
    return (
        <Icon>
            <path d="M5 3l14 7-6 2-2 6z" />
        </Icon>
    );
}

function ShieldIcon(): React.ReactElement {
    return (
        <Icon>
            <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
            <path d="M9 12l2 2 4-4" />
        </Icon>
    );
}

function LockIcon(): React.ReactElement {
    return (
        <Icon>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </Icon>
    );
}

function CheckIcon(): React.ReactElement {
    return (
        <Icon>
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12.5l2.5 2.5L16 9.5" />
        </Icon>
    );
}
