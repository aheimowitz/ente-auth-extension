/**
 * Inline autofill icon and dropdown component.
 * Appears inside the MFA input field like LastPass.
 * Renders in a Shadow DOM for style isolation.
 */
import React, { useEffect, useState, useRef, useCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { generateOTPs, getProgress } from "@shared/otp";
import { prettyFormatCode } from "@shared/code";
import { getResolvedTheme } from "@shared/useTheme";
import { browser, sendMessage } from "@shared/browser";
import type { Code, DomainMatch } from "@shared/types";

type ResolvedTheme = "light" | "dark";

// Theme color definitions
const themeColors = {
    dark: {
        background: "#1B1B1B",
        backgroundHover: "#252525",
        textPrimary: "#FFFFFF",
        textMuted: "rgba(255, 255, 255, 0.70)",
        textFaint: "rgba(255, 255, 255, 0.50)",
        stroke: "rgba(255, 255, 255, 0.12)",
        accentPurple: "#8F33D6",
        success: "#4CAF50",
    },
    light: {
        background: "#FFFFFF",
        backgroundHover: "#F5F5F5",
        textPrimary: "#000000",
        textMuted: "rgba(0, 0, 0, 0.60)",
        textFaint: "rgba(0, 0, 0, 0.50)",
        stroke: "rgba(0, 0, 0, 0.12)",
        accentPurple: "#8F33D6",
        success: "#4CAF50",
    },
};

type DropdownView = "matches" | "search" | "confirm";

interface DropdownProps {
    matches: DomainMatch[];
    timeOffset: number;
    onFill: (code: string) => void;
    onClose: () => void;
    theme: ResolvedTheme;
    domain: string;
}

const Dropdown: React.FC<DropdownProps> = ({
    matches,
    timeOffset,
    onFill,
    onClose,
    theme,
    domain,
}) => {
    const [otps, setOtps] = useState<Map<string, string>>(new Map());
    const [progress, setProgress] = useState<Map<string, number>>(new Map());
    const [view, setView] = useState<DropdownView>(matches.length > 0 ? "matches" : "search");
    const [allCodes, setAllCodes] = useState<Code[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCode, setSelectedCode] = useState<Code | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Load all codes when switching to search view
    useEffect(() => {
        if (view === "search" && allCodes.length === 0) {
            sendMessage<{ success: boolean; data?: { codes: Code[] } }>({
                type: "GET_CODES",
            }).then((response) => {
                if (response?.success && response.data?.codes) {
                    setAllCodes(response.data.codes);
                }
            });
        }
    }, [view, allCodes.length]);

    // Focus search input when entering search view
    useEffect(() => {
        if (view === "search" && searchInputRef.current) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [view]);

    // Get codes to display based on view
    const displayCodes: Code[] = view === "matches"
        ? matches.map((m) => m.code)
        : allCodes.filter((code) => {
            if (!searchQuery.trim()) return true;
            const query = searchQuery.toLowerCase();
            return (
                code.issuer.toLowerCase().includes(query) ||
                code.account?.toLowerCase().includes(query)
            );
        });

    // Update OTPs every second
    useEffect(() => {
        const updateOtps = () => {
            const newOtps = new Map<string, string>();
            const newProgress = new Map<string, number>();

            displayCodes.forEach((code) => {
                const [otp] = generateOTPs(code, timeOffset);
                newOtps.set(code.id, otp);
                newProgress.set(code.id, getProgress(code, timeOffset));
            });

            setOtps(newOtps);
            setProgress(newProgress);
        };

        updateOtps();
        const interval = setInterval(updateOtps, 1000);

        return () => clearInterval(interval);
    }, [displayCodes, timeOffset]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const timeoutId = setTimeout(() => {
            document.addEventListener("mousedown", handleClickOutside, false);
        }, 100);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener("mousedown", handleClickOutside, false);
        };
    }, [onClose]);

    // Handle code selection from search
    const handleSelectCode = useCallback((code: Code) => {
        const otp = otps.get(code.id) || "";
        // If user was in search view (no matches), offer to save mapping
        if (matches.length === 0) {
            setSelectedCode(code);
            setView("confirm");
        } else {
            onFill(otp);
        }
    }, [matches.length, onFill, otps]);

    // Handle confirming the fill (with or without saving mapping)
    const handleConfirmFill = useCallback(async (saveMapping: boolean) => {
        if (!selectedCode) return;

        const otp = otps.get(selectedCode.id) || generateOTPs(selectedCode, timeOffset)[0];

        if (saveMapping) {
            setSaving(true);
            try {
                await sendMessage({
                    type: "ADD_CUSTOM_MAPPING",
                    mapping: {
                        domain,
                        issuer: selectedCode.issuer,
                    },
                });
                setSaved(true);
                setTimeout(() => {
                    onFill(otp);
                }, 500);
            } catch (e) {
                console.error("Failed to save mapping:", e);
                onFill(otp);
            } finally {
                setSaving(false);
            }
        } else {
            onFill(otp);
        }
    }, [selectedCode, otps, timeOffset, domain, onFill]);

    const colors = themeColors[theme];

    const styles: Record<string, React.CSSProperties> = {
        dropdown: {
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "4px",
            minWidth: "300px",
            maxWidth: "340px",
            backgroundColor: colors.background,
            borderRadius: "8px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
            border: `1px solid ${colors.stroke}`,
            overflow: "hidden",
            zIndex: 2147483647,
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        header: {
            display: "flex",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: `1px solid ${colors.stroke}`,
            gap: "8px",
            backgroundColor: colors.background,
        },
        headerText: {
            fontSize: "14px",
            fontWeight: 600,
            color: colors.textPrimary,
            flex: 1,
        },
        backButton: {
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colors.textMuted,
        },
        searchContainer: {
            padding: "8px 16px",
            borderBottom: `1px solid ${colors.stroke}`,
        },
        searchInput: {
            width: "100%",
            padding: "8px 12px",
            fontSize: "14px",
            border: `1px solid ${colors.stroke}`,
            borderRadius: "6px",
            backgroundColor: colors.background,
            color: colors.textPrimary,
            outline: "none",
            boxSizing: "border-box",
        },
        list: {
            maxHeight: "280px",
            overflowY: "auto",
            padding: "8px",
        },
        item: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            cursor: "pointer",
            transition: "background-color 0.15s",
            borderRadius: "8px",
            marginBottom: "4px",
            backgroundColor: "transparent",
        },
        itemInfo: {
            flex: 1,
            minWidth: 0,
            marginRight: "16px",
        },
        issuer: {
            fontSize: "15px",
            fontWeight: 600,
            color: colors.textPrimary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: "2px",
        },
        account: {
            fontSize: "13px",
            fontWeight: 500,
            color: colors.textFaint,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        },
        otpContainer: {
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "4px",
        },
        otp: {
            fontSize: "18px",
            fontWeight: 600,
            color: colors.textPrimary,
            letterSpacing: "0.02em",
        },
        progressBarContainer: {
            width: "50px",
            height: "3px",
            backgroundColor: colors.stroke,
            borderRadius: "2px",
            overflow: "hidden",
        },
        progressBar: {
            height: "100%",
            backgroundColor: colors.accentPurple,
            transition: "width 1s linear",
        },
        empty: {
            padding: "24px 16px",
            textAlign: "center",
            color: colors.textFaint,
            fontSize: "14px",
            fontWeight: 500,
        },
        searchAllButton: {
            display: "block",
            width: "calc(100% - 32px)",
            margin: "0 16px 16px",
            padding: "10px 16px",
            fontSize: "14px",
            fontWeight: 600,
            color: "#FFFFFF",
            backgroundColor: colors.accentPurple,
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            textAlign: "center",
        },
        confirmContainer: {
            padding: "16px",
        },
        confirmText: {
            fontSize: "14px",
            color: colors.textPrimary,
            marginBottom: "12px",
            lineHeight: 1.5,
        },
        confirmDomain: {
            fontWeight: 600,
            color: colors.accentPurple,
        },
        confirmIssuer: {
            fontWeight: 600,
        },
        buttonRow: {
            display: "flex",
            gap: "8px",
        },
        confirmButton: {
            flex: 1,
            padding: "10px 16px",
            fontSize: "14px",
            fontWeight: 600,
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
        },
        saveButton: {
            backgroundColor: colors.accentPurple,
            color: "#FFFFFF",
        },
        skipButton: {
            backgroundColor: colors.stroke,
            color: colors.textPrimary,
        },
        savedMessage: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "16px",
            color: colors.success,
            fontSize: "14px",
            fontWeight: 600,
        },
    };

    // Render confirmation view
    if (view === "confirm" && selectedCode) {
        if (saved) {
            return (
                <div ref={dropdownRef} style={styles.dropdown}>
                    <div style={styles.header}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M12 2L3 7V12C3 16.97 6.84 21.66 12 23C17.16 21.66 21 16.97 21 12V7L12 2Z"
                                fill="#8F33D6"
                            />
                            <path
                                d="M10 17L6 13L7.41 11.59L10 14.17L16.59 7.58L18 9L10 17Z"
                                fill="white"
                            />
                        </svg>
                        <span style={styles.headerText}>Ente Auth Extension</span>
                    </div>
                    <div style={styles.savedMessage}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                                fill={colors.success}
                            />
                        </svg>
                        Mapping saved!
                    </div>
                </div>
            );
        }

        return (
            <div ref={dropdownRef} style={styles.dropdown}>
                <div style={styles.header}>
                    <button
                        style={styles.backButton}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setView("search");
                        }}
                        title="Back to search"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                        </svg>
                    </button>
                    <span style={styles.headerText}>Save Mapping?</span>
                </div>
                <div style={styles.confirmContainer}>
                    <p style={styles.confirmText}>
                        Remember <span style={styles.confirmIssuer}>{selectedCode.issuer}</span> for{" "}
                        <span style={styles.confirmDomain}>{domain}</span>?
                    </p>
                    <div style={styles.buttonRow}>
                        <button
                            style={{ ...styles.confirmButton, ...styles.skipButton }}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleConfirmFill(false);
                            }}
                            disabled={saving}
                        >
                            Just fill
                        </button>
                        <button
                            style={{ ...styles.confirmButton, ...styles.saveButton }}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleConfirmFill(true);
                            }}
                            disabled={saving}
                        >
                            {saving ? "Saving..." : "Save & fill"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Render search view
    if (view === "search") {
        return (
            <div ref={dropdownRef} style={styles.dropdown}>
                <div style={styles.header}>
                    {matches.length > 0 && (
                        <button
                            style={styles.backButton}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setView("matches");
                            }}
                            title="Back to matches"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                            </svg>
                        </button>
                    )}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M12 2L3 7V12C3 16.97 6.84 21.66 12 23C17.16 21.66 21 16.97 21 12V7L12 2Z"
                            fill="#8F33D6"
                        />
                        <path
                            d="M10 17L6 13L7.41 11.59L10 14.17L16.59 7.58L18 9L10 17Z"
                            fill="white"
                        />
                    </svg>
                    <span style={styles.headerText}>Search All Codes</span>
                </div>
                <div style={styles.searchContainer}>
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search by name or account..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={styles.searchInput}
                    />
                </div>
                <div style={styles.list}>
                    {displayCodes.length === 0 ? (
                        <div style={styles.empty}>
                            {allCodes.length === 0 ? "Loading codes..." : "No codes found"}
                        </div>
                    ) : (
                        displayCodes.map((code) => (
                            <div
                                key={code.id}
                                style={styles.item}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSelectCode(code);
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.backgroundHover;
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                                }}
                            >
                                <div style={styles.itemInfo}>
                                    <div style={styles.issuer}>{code.issuer}</div>
                                    {code.account && (
                                        <div style={styles.account}>{code.account}</div>
                                    )}
                                </div>
                                <div style={styles.otpContainer}>
                                    <div style={styles.otp}>
                                        {prettyFormatCode(otps.get(code.id) || "")}
                                    </div>
                                    <div style={styles.progressBarContainer}>
                                        <div
                                            style={{
                                                ...styles.progressBar,
                                                width: `${(progress.get(code.id) || 0) * 100}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    // Render matches view (default)
    return (
        <div ref={dropdownRef} style={styles.dropdown}>
            <div style={styles.header}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M12 2L3 7V12C3 16.97 6.84 21.66 12 23C17.16 21.66 21 16.97 21 12V7L12 2Z"
                        fill="#8F33D6"
                    />
                    <path
                        d="M10 17L6 13L7.41 11.59L10 14.17L16.59 7.58L18 9L10 17Z"
                        fill="white"
                    />
                </svg>
                <span style={styles.headerText}>Ente Auth Extension</span>
            </div>
            <div style={styles.list}>
                {matches.length === 0 ? (
                    <div style={styles.empty}>No matching codes found</div>
                ) : (
                    matches.map(({ code }) => (
                        <div
                            key={code.id}
                            style={styles.item}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const otp = otps.get(code.id) || "";
                                onFill(otp);
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.backgroundHover;
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                            }}
                        >
                            <div style={styles.itemInfo}>
                                <div style={styles.issuer}>{code.issuer}</div>
                                {code.account && (
                                    <div style={styles.account}>{code.account}</div>
                                )}
                            </div>
                            <div style={styles.otpContainer}>
                                <div style={styles.otp}>
                                    {prettyFormatCode(otps.get(code.id) || "")}
                                </div>
                                <div style={styles.progressBarContainer}>
                                    <div
                                        style={{
                                            ...styles.progressBar,
                                            width: `${(progress.get(code.id) || 0) * 100}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {matches.length === 0 && (
                <button
                    style={styles.searchAllButton}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setView("search");
                    }}
                >
                    Search all codes
                </button>
            )}
        </div>
    );
};

interface AutofillIconProps {
    matches: DomainMatch[];
    timeOffset: number;
    onFill: (code: string) => void;
    inputElement: HTMLInputElement;
    autoFillSingleMatch: boolean;
    domain: string;
}

const AutofillIcon: React.FC<AutofillIconProps> = ({
    matches,
    timeOffset,
    onFill,
    inputElement,
    autoFillSingleMatch,
    domain,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [theme, setTheme] = useState<ResolvedTheme>("dark");
    const containerRef = useRef<HTMLDivElement>(null);

    // Load theme on mount
    useEffect(() => {
        getResolvedTheme().then(setTheme);
    }, []);

    // Auto-fill if single match and setting enabled
    useEffect(() => {
        if (autoFillSingleMatch && matches.length === 1) {
            const { code } = matches[0]!;
            const [otp] = generateOTPs(code, timeOffset);
            // Small delay to let the UI render
            setTimeout(() => {
                onFill(otp);
            }, 100);
        }
    }, [matches, timeOffset, onFill, autoFillSingleMatch]);

    const handleIconClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleFill = (code: string) => {
        onFill(code);
        setIsOpen(false);
    };

    const colors = themeColors[theme];

    const styles: Record<string, React.CSSProperties> = {
        container: {
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            zIndex: 2147483647,
        },
        iconButton: {
            width: "24px",
            height: "24px",
            borderRadius: "5px",
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            transition: "transform 0.15s, box-shadow 0.15s",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.25)",
            overflow: "hidden",
        },
    };

    return (
        <div ref={containerRef} style={styles.container}>
            <button
                style={styles.iconButton}
                onClick={handleIconClick}
                onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                }}
                title="Ente Auth Extension - Click to autofill"
            >
                {/* Use the same PNG icon as extension toolbar */}
                <img
                    src={browser.runtime.getURL("assets/icons/icon16.png")}
                    alt="Ente Auth Extension"
                    width="20"
                    height="20"
                    style={{ borderRadius: "4px" }}
                />
            </button>
            {isOpen && (
                <Dropdown
                    matches={matches}
                    timeOffset={timeOffset}
                    onFill={handleFill}
                    onClose={() => setIsOpen(false)}
                    theme={theme}
                    domain={domain}
                />
            )}
        </div>
    );
};

// Interface for shadow host with cleanup handler
interface ShadowHostWithCleanup extends HTMLDivElement {
    _cleanup?: () => void;
}

// Global state for popup management
let iconRoot: Root | null = null;
let iconWrapper: HTMLDivElement | null = null;
let shadowHost: ShadowHostWithCleanup | null = null;

/**
 * Position the icon inside the input field.
 */
const positionIcon = (inputElement: HTMLInputElement): void => {
    if (!shadowHost) return;

    const rect = inputElement.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Position to the right side inside the input (24px icon + 4px padding)
    const iconSize = 24;
    const padding = 4;
    const top = rect.top + scrollY + (rect.height - iconSize) / 2;
    const left = rect.right + scrollX - iconSize - padding;

    shadowHost.style.position = "absolute";
    shadowHost.style.top = `${top}px`;
    shadowHost.style.left = `${left}px`;
    shadowHost.style.zIndex = "2147483647";
};

/**
 * Show the autofill icon next to an input field.
 */
export const showPopup = (
    matches: DomainMatch[],
    timeOffset: number,
    onFill: (code: string) => void,
    inputElement?: HTMLInputElement,
    autoFillSingleMatch = true
): void => {
    // Remove existing icon
    hidePopup();

    if (!inputElement) return;

    // Get current domain
    const domain = window.location.hostname;

    // Create shadow host
    shadowHost = document.createElement("div");
    shadowHost.id = "ente-auth-icon-host";
    shadowHost.style.cssText = "all: initial; position: absolute; z-index: 2147483647;";

    const shadow = shadowHost.attachShadow({ mode: "closed" });

    // Create wrapper inside shadow DOM
    iconWrapper = document.createElement("div");
    shadow.appendChild(iconWrapper);

    // Mount React component
    iconRoot = createRoot(iconWrapper);
    iconRoot.render(
        <AutofillIcon
            matches={matches}
            timeOffset={timeOffset}
            onFill={onFill}
            inputElement={inputElement}
            autoFillSingleMatch={autoFillSingleMatch}
            domain={domain}
        />
    );

    document.body.appendChild(shadowHost);

    // Position the icon
    positionIcon(inputElement);

    // Reposition on scroll/resize
    const handleReposition = () => positionIcon(inputElement);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);

    // Store cleanup handlers
    shadowHost._cleanup = () => {
        window.removeEventListener("scroll", handleReposition, true);
        window.removeEventListener("resize", handleReposition);
    };
};

/**
 * Hide and cleanup the icon.
 */
export const hidePopup = (): void => {
    if (shadowHost) {
        // Run cleanup handlers
        if (shadowHost._cleanup) {
            shadowHost._cleanup();
        }
    }
    if (iconRoot) {
        iconRoot.unmount();
        iconRoot = null;
    }
    if (shadowHost && shadowHost.parentNode) {
        shadowHost.parentNode.removeChild(shadowHost);
        shadowHost = null;
    }
    iconWrapper = null;
};

/**
 * Check if popup is currently visible.
 */
export const isPopupVisible = (): boolean => {
    return shadowHost !== null;
};
