/**
 * Add/Edit form for TOTP codes.
 */
import React, { useState, useEffect } from "react";
import { isValidBase32 } from "@shared/code";
import type { Code, CodeFormData } from "@shared/types";

interface CodeFormProps {
    mode: "add" | "edit";
    initialData?: Code;
    allTags: string[];
    onSave: (data: CodeFormData) => Promise<void>;
    onCancel: () => void;
    onDelete?: () => void;
}

export const CodeForm: React.FC<CodeFormProps> = ({
    mode,
    initialData,
    allTags,
    onSave,
    onCancel,
    onDelete,
}) => {
    const [issuer, setIssuer] = useState(initialData?.issuer || "");
    const [account, setAccount] = useState(initialData?.account || "");
    const [secret, setSecret] = useState(initialData?.secret || "");
    const [type, setType] = useState<"totp" | "hotp" | "steam">(
        initialData?.type || "totp"
    );
    const [algorithm, setAlgorithm] = useState<"sha1" | "sha256" | "sha512">(
        initialData?.algorithm || "sha1"
    );
    const [digits, setDigits] = useState(initialData?.length || 6);
    const [period, setPeriod] = useState(initialData?.period || 30);
    const [counter, setCounter] = useState(initialData?.counter || 0);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showSecret, setShowSecret] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [tags, setTags] = useState<string[]>(initialData?.codeDisplay?.tags || []);
    const [tagInput, setTagInput] = useState("");
    const [showTagInput, setShowTagInput] = useState(false);

    // Adjust digits when type changes
    useEffect(() => {
        if (type === "steam" && digits !== 5) {
            setDigits(5);
        } else if (type !== "steam" && digits === 5) {
            setDigits(6);
        }
    }, [type]);

    // Toggle a tag on/off
    const toggleTag = (tag: string) => {
        if (tags.includes(tag)) {
            setTags(tags.filter((t) => t !== tag));
        } else {
            setTags([...tags, tag]);
        }
    };

    // Add a new tag (creates it and selects it)
    const addNewTag = () => {
        const newTag = tagInput.trim();
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
            setTagInput("");
            setShowTagInput(false);
        }
    };

    // Handle tag input keydown (Enter to add)
    const handleTagKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addNewTag();
        }
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!issuer.trim()) {
            newErrors.issuer = "Issuer is required";
        }

        if (!secret.trim()) {
            newErrors.secret = "Secret is required";
        } else if (!isValidBase32(secret)) {
            newErrors.secret = "Invalid secret. Must be at least 16 Base32 characters (A-Z, 2-7)";
        }

        if (digits < 5 || digits > 8) {
            newErrors.digits = "Digits must be between 5 and 8";
        }

        if (period < 15 || period > 120) {
            newErrors.period = "Period must be between 15 and 120 seconds";
        }

        if (type === "hotp" && counter < 0) {
            newErrors.counter = "Counter must be 0 or greater";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validate()) {
            return;
        }

        setSaving(true);
        try {
            // Build codeDisplay with updated tags
            const codeDisplay = {
                ...initialData?.codeDisplay,
                tags: tags.length > 0 ? tags : undefined,
            };

            const formData: CodeFormData = {
                issuer: issuer.trim(),
                account: account.trim() || undefined,
                secret: secret.replace(/\s/g, "").toUpperCase(),
                type,
                algorithm,
                digits,
                period,
                counter: type === "hotp" ? counter : undefined,
                codeDisplay: Object.keys(codeDisplay).some(
                    (k) => codeDisplay[k as keyof typeof codeDisplay] !== undefined
                )
                    ? codeDisplay
                    : undefined,
            };

            await onSave(formData);
        } catch (error) {
            setErrors({
                form: error instanceof Error ? error.message : "Failed to save",
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="code-form-container">
            <div className="form-header">
                <button
                    type="button"
                    className="back-button"
                    onClick={onCancel}
                    disabled={saving}
                >
                    <BackIcon />
                </button>
                <h2 className="form-title">
                    {mode === "add" ? "Add Code" : "Edit Code"}
                </h2>
                <div className="form-header-spacer" />
            </div>

            <form className="code-form" onSubmit={handleSubmit}>
                <div className="form-field">
                    <label htmlFor="issuer">Issuer *</label>
                    <input
                        id="issuer"
                        type="text"
                        value={issuer}
                        onChange={(e) => setIssuer(e.target.value)}
                        placeholder="e.g., Google, GitHub"
                        autoFocus
                        disabled={saving}
                    />
                    {errors.issuer && (
                        <span className="field-error">{errors.issuer}</span>
                    )}
                </div>

                <div className="form-field">
                    <label htmlFor="account">Account</label>
                    <input
                        id="account"
                        type="text"
                        value={account}
                        onChange={(e) => setAccount(e.target.value)}
                        placeholder="e.g., user@example.com"
                        disabled={saving}
                    />
                </div>

                <div className="form-field">
                    <label htmlFor="secret">Secret Key *</label>
                    <div className="secret-input-wrapper">
                        <input
                            id="secret"
                            type={showSecret ? "text" : "password"}
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            placeholder="Base32 encoded secret"
                            disabled={saving}
                            autoComplete="off"
                        />
                        <button
                            type="button"
                            className="secret-toggle"
                            onClick={() => setShowSecret(!showSecret)}
                            disabled={saving}
                        >
                            {showSecret ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                    </div>
                    {errors.secret && (
                        <span className="field-error">{errors.secret}</span>
                    )}
                </div>

                {/* Tags - show all available tags as toggleable chips */}
                <div className="tags-editor">
                    <span className="tags-editor-label">Tags</span>
                    <div className="tags-wrap">
                        {/* Show all existing tags as toggleable */}
                        {allTags.map((tag) => (
                            <button
                                key={tag}
                                type="button"
                                className={`tag-chip-toggle ${tags.includes(tag) ? "selected" : ""}`}
                                onClick={() => toggleTag(tag)}
                                disabled={saving}
                            >
                                {tag}
                            </button>
                        ))}
                        {/* Also show any tags on this code that aren't in allTags (edge case) */}
                        {tags.filter((t) => !allTags.includes(t)).map((tag) => (
                            <button
                                key={tag}
                                type="button"
                                className="tag-chip-toggle selected"
                                onClick={() => toggleTag(tag)}
                                disabled={saving}
                            >
                                {tag}
                            </button>
                        ))}
                        {/* Add new tag button - purple plus circle outline */}
                        <button
                            type="button"
                            className="tag-add-btn"
                            onClick={() => setShowTagInput(true)}
                            disabled={saving}
                            title="Add new tag"
                        >
                            <PlusCircleIcon />
                        </button>
                    </div>
                </div>

                {/* Add new tag popup */}
                {showTagInput && (
                    <div className="modal-overlay" onClick={() => { setShowTagInput(false); setTagInput(""); }}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-title">New Tag</div>
                            <div className="modal-field">
                                <input
                                    type="text"
                                    className="modal-input"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={handleTagKeyDown}
                                    placeholder="Tag name"
                                    autoFocus
                                    maxLength={100}
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="modal-button cancel"
                                    onClick={() => { setShowTagInput(false); setTagInput(""); }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="modal-button save"
                                    onClick={addNewTag}
                                    disabled={!tagInput.trim()}
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Advanced options only shown in add mode */}
                {mode === "add" && (
                    <>
                        <button
                            type="button"
                            className="advanced-toggle"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                        >
                            {showAdvanced ? "Hide" : "Show"} Advanced Options
                            <ChevronIcon direction={showAdvanced ? "up" : "down"} />
                        </button>

                        {showAdvanced && (
                            <div className="advanced-section">
                                <div className="form-field">
                                    <label htmlFor="type">Type</label>
                                    <select
                                        id="type"
                                        value={type}
                                        onChange={(e) =>
                                            setType(e.target.value as "totp" | "hotp" | "steam")
                                        }
                                        disabled={saving}
                                    >
                                        <option value="totp">TOTP (Time-based)</option>
                                        <option value="hotp">HOTP (Counter-based)</option>
                                        <option value="steam">Steam</option>
                                    </select>
                                </div>

                                <div className="form-field">
                                    <label htmlFor="algorithm">Algorithm</label>
                                    <select
                                        id="algorithm"
                                        value={algorithm}
                                        onChange={(e) =>
                                            setAlgorithm(
                                                e.target.value as
                                                    | "sha1"
                                                    | "sha256"
                                                    | "sha512"
                                            )
                                        }
                                        disabled={saving}
                                    >
                                        <option value="sha1">SHA-1</option>
                                        <option value="sha256">SHA-256</option>
                                        <option value="sha512">SHA-512</option>
                                    </select>
                                </div>

                                <div className="form-row">
                                    <div className="form-field">
                                        <label htmlFor="digits">Digits</label>
                                        <input
                                            id="digits"
                                            type="number"
                                            min={5}
                                            max={8}
                                            value={digits}
                                            onChange={(e) =>
                                                setDigits(parseInt(e.target.value, 10))
                                            }
                                            disabled={saving || type === "steam"}
                                        />
                                        {errors.digits && (
                                            <span className="field-error">
                                                {errors.digits}
                                            </span>
                                        )}
                                    </div>

                                    {type === "totp" && (
                                        <div className="form-field">
                                            <label htmlFor="period">
                                                Period (seconds)
                                            </label>
                                            <input
                                                id="period"
                                                type="number"
                                                min={15}
                                                max={120}
                                                value={period}
                                                onChange={(e) =>
                                                    setPeriod(
                                                        parseInt(e.target.value, 10)
                                                    )
                                                }
                                                disabled={saving}
                                            />
                                            {errors.period && (
                                                <span className="field-error">
                                                    {errors.period}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {type === "hotp" && (
                                        <div className="form-field">
                                            <label htmlFor="counter">Counter</label>
                                            <input
                                                id="counter"
                                                type="number"
                                                min={0}
                                                value={counter}
                                                onChange={(e) =>
                                                    setCounter(
                                                        parseInt(e.target.value, 10)
                                                    )
                                                }
                                                disabled={saving}
                                            />
                                            {errors.counter && (
                                                <span className="field-error">
                                                    {errors.counter}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {errors.form && (
                    <div className="form-error">{errors.form}</div>
                )}

                <div className="form-actions">
                    {/* Delete button - only in edit mode */}
                    {mode === "edit" && onDelete && (
                        <button
                            type="button"
                            className="delete-icon-button"
                            onClick={onDelete}
                            disabled={saving}
                            title="Delete code"
                        >
                            <TrashIcon />
                        </button>
                    )}
                    <button
                        type="button"
                        className="cancel-button"
                        onClick={onCancel}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="save-button"
                        disabled={saving}
                    >
                        {saving ? "Saving..." : mode === "add" ? "Add" : "Save"}
                    </button>
                </div>
            </form>
        </div>
    );
};

// Back arrow icon
const BackIcon: React.FC = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
);

// Eye icon (show password)
const EyeIcon: React.FC = () => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

// Eye off icon (hide password)
const EyeOffIcon: React.FC = () => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

// Plus circle outline icon (for add tag button) - matches Ente app style
const PlusCircleIcon: React.FC = () => (
    <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
);

// Trash icon
const TrashIcon: React.FC = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
);

// Chevron icon
const ChevronIcon: React.FC<{ direction: "up" | "down" }> = ({ direction }) => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
            transform: direction === "up" ? "rotate(180deg)" : undefined,
            transition: "transform 0.2s",
        }}
    >
        <polyline points="6 9 12 15 18 9" />
    </svg>
);
