/**
 * Inline autofill icon and dropdown component.
 * Appears inside the MFA input field like LastPass.
 * Renders in a Shadow DOM for style isolation.
 */
import React, { useEffect, useState, useRef, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { prettyFormatCode } from "@shared/code";
import { ACCENT_COLORS, getResolvedAccentColor, getResolvedTheme } from "@shared/useTheme";
import { renderDuckeyIconDataUrl } from "@shared/icon";
import { browser, sendMessage } from "@shared/browser";
import type { AuthState, AutofillMatch } from "@shared/types";

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
        success: "#4CAF50",
    },
    light: {
        background: "#FFFFFF",
        backgroundHover: "#F5F5F5",
        textPrimary: "#000000",
        textMuted: "rgba(0, 0, 0, 0.60)",
        textFaint: "rgba(0, 0, 0, 0.50)",
        stroke: "rgba(0, 0, 0, 0.12)",
        success: "#4CAF50",
    },
};

interface DropdownProps {
    matches: AutofillMatch[];
    timeOffset: number;
    onFill: (code: string) => void;
    onClose: () => void;
    theme: ResolvedTheme;
    accentColor: string;
    domain: string;
}

const Dropdown: React.FC<DropdownProps> = ({
    matches,
    timeOffset,
    onFill,
    onClose,
    theme,
    accentColor,
}) => {
    const [currentMatches, setCurrentMatches] = useState<AutofillMatch[]>(matches);
    const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map());
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setCurrentMatches(matches);
    }, [matches]);

    // Update progress bars every second and re-fetch OTPs when period expires
    useEffect(() => {
        const updateProgress = () => {
            const newProgress = new Map<string, number>();
            let needsRefresh = false;

            currentMatches.forEach((match) => {
                const periodMs = (match.period || 30) * 1000;
                const timestamp = Date.now() + timeOffset;
                const elapsedMs = timestamp % periodMs;
                const timeRemaining = Math.floor((periodMs - elapsedMs) / 1000);
                newProgress.set(match.id, (periodMs - elapsedMs) / periodMs);
                if (timeRemaining === 0) {
                    needsRefresh = true;
                }
            });

            setProgressMap(newProgress);

            if (needsRefresh) {
                sendMessage<{ success: boolean; data?: { matches: AutofillMatch[] } }>({
                    type: "GET_CODES_FOR_DOMAIN",
                }).then((res) => {
                    if (res?.success && res.data?.matches) {
                        setCurrentMatches(res.data.matches);
                    }
                }).catch(() => {});
            }
        };

        updateProgress();
        const interval = setInterval(updateProgress, 1000);

        return () => clearInterval(interval);
    }, [currentMatches, timeOffset]);

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

    const colors = { ...themeColors[theme], accent: accentColor };

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
            backgroundColor: colors.accent,
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
            backgroundColor: colors.accent,
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            textAlign: "center",
        },
    };

    return (
        <div ref={dropdownRef} style={styles.dropdown}>
            <div style={styles.header}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect width="24" height="24" rx="5.25" fill={colors.accent} />
                    <path d="M6.75 10.5C4.13 9.94 1.69 10.5 1.69 12C1.69 13.5 4.13 14.06 6.75 13.5Z" fill="#F7A325" />
                    <path d="M11.25 10.31H21A.75.75 0 0 1 21.75 11.06V12.56A.75.75 0 0 1 21 13.31H20.25V15.75A.56.56 0 0 1 19.69 16.31H18.56A.56.56 0 0 1 18 15.75V13.31H16.88V14.81A.56.56 0 0 1 16.31 15.38H15.19A.56.56 0 0 1 14.63 14.81V13.31H11.25Z" fill="#FFF6E0" />
                    <circle cx="9" cy="11.81" r="5.06" fill="#FFF6E0" />
                    <circle cx="9.38" cy="10.31" r="0.94" fill="#0A5048" />
                </svg>
                <span style={styles.headerText}>Duckey</span>
            </div>
            <div style={styles.list}>
                {currentMatches.length === 0 ? (
                    <div style={styles.empty}>
                        <div style={{ marginBottom: "6px" }}>No matching codes found</div>
                        <div style={{ fontSize: "12px", color: colors.textMuted }}>
                            Click the Duckey toolbar icon to view all codes
                        </div>
                    </div>
                ) : (
                    currentMatches.map((match) => (
                        <div
                            key={match.id}
                            style={styles.item}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onFill(match.otp);
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.backgroundHover;
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                            }}
                        >
                            <div style={styles.itemInfo}>
                                <div style={styles.issuer}>{match.issuer}</div>
                                {match.account && (
                                    <div style={styles.account}>{match.account}</div>
                                )}
                            </div>
                            <div style={styles.otpContainer}>
                                <div style={styles.otp}>
                                    {prettyFormatCode(match.otp)}
                                </div>
                                <div style={styles.progressBarContainer}>
                                    <div
                                        style={{
                                            ...styles.progressBar,
                                            width: `${(progressMap.get(match.id) ?? match.progress) * 100}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {currentMatches.length === 0 && (
                <button
                    style={styles.searchAllButton}
                    onMouseDown={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                            await sendMessage({ type: "OPEN_POPUP" });
                        } catch (err) {
                            console.warn("[Duckey] Failed to open popup directly:", err);
                        } finally {
                            onClose();
                        }
                    }}
                >
                    Search all codes
                </button>
            )}
        </div>
    );
};

interface AuthPromptDropdownProps {
    needsLogin: boolean;
    onClose: () => void;
    theme: ResolvedTheme;
    accentColor: string;
}

const AuthPromptDropdown: React.FC<AuthPromptDropdownProps> = ({
    needsLogin,
    onClose,
    theme,
    accentColor,
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);

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

    const handleAction = async () => {
        if (needsLogin) {
            await sendMessage({ type: "OPEN_LOGIN_PAGE" });
        } else {
            await sendMessage({ type: "OPEN_POPUP" });
        }
        onClose();
    };

    const colors = { ...themeColors[theme], accent: accentColor };

    const styles: Record<string, React.CSSProperties> = {
        dropdown: {
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "4px",
            minWidth: "280px",
            maxWidth: "320px",
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
        body: {
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
        },
        message: {
            fontSize: "13px",
            color: colors.textMuted,
            lineHeight: 1.45,
            margin: 0,
        },
        button: {
            width: "100%",
            padding: "10px 16px",
            fontSize: "14px",
            fontWeight: 600,
            color: "#FFFFFF",
            backgroundColor: colors.accent,
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
        },
    };

    return (
        <div ref={dropdownRef} style={styles.dropdown}>
            <div style={styles.header}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect width="24" height="24" rx="5.25" fill={colors.accent} />
                    <path d="M6.75 10.5C4.13 9.94 1.69 10.5 1.69 12C1.69 13.5 4.13 14.06 6.75 13.5Z" fill="#F7A325" />
                    <path d="M11.25 10.31H21A.75.75 0 0 1 21.75 11.06V12.56A.75.75 0 0 1 21 13.31H20.25V15.75A.56.56 0 0 1 19.69 16.31H18.56A.56.56 0 0 1 18 15.75V13.31H16.88V14.81A.56.56 0 0 1 16.31 15.38H15.19A.56.56 0 0 1 14.63 14.81V13.31H11.25Z" fill="#FFF6E0" />
                    <circle cx="9" cy="11.81" r="5.06" fill="#FFF6E0" />
                    <circle cx="9.38" cy="10.31" r="0.94" fill="#0A5048" />
                </svg>
                <span style={styles.headerText}>
                    {needsLogin ? "Duckey" : "Vault Locked"}
                </span>
            </div>
            <div style={styles.body}>
                <p style={styles.message}>
                    {needsLogin
                        ? "Sign in to your Ente account to autofill 2FA codes."
                        : "Vault Locked — Click to unlock in extension"}
                </p>
                <button
                    type="button"
                    style={styles.button}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAction();
                    }}
                >
                    {needsLogin ? "Log in" : "Unlock Vault"}
                </button>
            </div>
        </div>
    );
};

interface AutofillIconProps {
    matches: AutofillMatch[];
    timeOffset: number;
    onFill: (code: string, userInitiated?: boolean) => void;
    inputElement: HTMLInputElement;
    autoFillSingleMatch: boolean;
    domain: string;
    authState?: AuthState;
    openOnShow?: boolean;
}

const AutofillIcon: React.FC<AutofillIconProps> = ({
    matches,
    timeOffset,
    onFill,
    inputElement,
    autoFillSingleMatch,
    domain,
    authState,
    openOnShow = false,
}) => {
    // Treat unknown auth state as authenticated so we never block on a missing field.
    const isAuthenticated = !authState || (authState.isLoggedIn && authState.isUnlocked);
    const needsLogin = !!authState && !authState.isLoggedIn;

    const shouldAutoOpenDropdown =
        isAuthenticated &&
        !(autoFillSingleMatch && matches.length === 1) &&
        (matches.length > 0 || !autoFillSingleMatch);
    // openOnShow (explicit request, e.g. the context menu) opens even with no
    // matches or a locked vault; a lone match is still filled directly if allowed
    const [isOpen, setIsOpen] = useState(() =>
        openOnShow
            ? !(isAuthenticated && autoFillSingleMatch && matches.length === 1)
            : shouldAutoOpenDropdown
    );
    const [theme, setTheme] = useState<ResolvedTheme>("dark");
    const [accentColor, setAccentColor] = useState(ACCENT_COLORS.duckey);
    // Packaged icon for the default accent, otherwise draw it in the user's color
    const iconSrc = useMemo(
        () =>
            accentColor === ACCENT_COLORS.duckey
                ? browser.runtime.getURL("assets/icons/icon32.png")
                : renderDuckeyIconDataUrl(accentColor, 40),
        [accentColor]
    );
    const containerRef = useRef<HTMLDivElement>(null);

    // Load theme on mount
    useEffect(() => {
        getResolvedTheme().then(setTheme);
        getResolvedAccentColor().then(setAccentColor);
    }, []);

    // Auto-fill if single match and setting enabled
    useEffect(() => {
        if (isAuthenticated && autoFillSingleMatch && matches.length === 1) {
            const match = matches[0]!;
            const otp = match.otp;
            // Small delay to let the UI render
            setTimeout(() => {
                onFill(otp, false);
            }, 100);
        }
    }, [matches, onFill, autoFillSingleMatch, isAuthenticated]);

    const handleIconClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleFill = (code: string) => {
        onFill(code);
        setIsOpen(false);
    };

    const iconTitle = isAuthenticated
        ? "Duckey - Click to autofill"
        : needsLogin
            ? "Duckey - Click to log in"
            : "Duckey - Click to unlock";

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
        iconImage: {
            borderRadius: "4px",
            filter: isAuthenticated ? "none" : "grayscale(1)",
            opacity: isAuthenticated ? 1 : 0.5,
            transition: "filter 0.15s, opacity 0.15s",
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
                title={iconTitle}
            >
                {/* 32px+ source rendered at 20px stays sharp on HiDPI displays */}
                <img
                    src={iconSrc}
                    alt="Duckey"
                    width="20"
                    height="20"
                    style={styles.iconImage}
                />
            </button>
            {isOpen && isAuthenticated && (
                <Dropdown
                    matches={matches}
                    timeOffset={timeOffset}
                    onFill={handleFill}
                    onClose={() => setIsOpen(false)}
                    theme={theme}
                    accentColor={accentColor}
                    domain={domain}
                />
            )}
            {isOpen && !isAuthenticated && (
                <AuthPromptDropdown
                    needsLogin={needsLogin}
                    onClose={() => setIsOpen(false)}
                    theme={theme}
                    accentColor={accentColor}
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
 * Position the icon relative to an anchor input.
 * - "inside": overlay on the right edge of the input (default for single inputs).
 * - "outside": place to the right of the input with a small gap (used for
 *   split single-digit inputs that are too narrow for an inset icon).
 */
const positionIcon = (
    anchorElement: HTMLInputElement,
    placement: "inside" | "outside" = "inside"
): void => {
    if (!shadowHost) return;

    const rect = anchorElement.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const iconSize = 24;
    const padding = 4;
    const top = rect.top + scrollY + (rect.height - iconSize) / 2;
    const left = placement === "outside"
        ? rect.right + scrollX + padding
        : rect.right + scrollX - iconSize - padding;

    shadowHost.style.position = "absolute";
    shadowHost.style.top = `${top}px`;
    shadowHost.style.left = `${left}px`;
    shadowHost.style.zIndex = "2147483647";
};

/**
 * Show the autofill icon next to an input field.
 */
export const showPopup = (
    matches: AutofillMatch[],
    timeOffset: number,
    onFill: (code: string, userInitiated?: boolean) => void,
    inputElement?: HTMLInputElement,
    autoFillSingleMatch = true,
    authState?: AuthState,
    placement: "inside" | "outside" = "inside",
    openOnShow = false
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
            authState={authState}
            openOnShow={openOnShow}
        />
    );

    document.body.appendChild(shadowHost);

    // Position the icon
    positionIcon(inputElement, placement);

    // Reposition on scroll/resize
    const handleReposition = () => positionIcon(inputElement, placement);
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
