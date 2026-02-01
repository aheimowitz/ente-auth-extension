/**
 * Extension popup main application component.
 */
import React, { useEffect, useState, useRef, useCallback } from "react";
import { browser, sendMessage, openOptionsPage } from "@shared/browser";
import { searchCodes } from "@shared/domain-matcher";
import { generateOTPs } from "@shared/otp";
import { useTheme } from "@shared/useTheme";
import type { AuthState, Code, CodeFormData, ParsedQRCode } from "@shared/types";
import { CodeCard } from "./CodeCard";
import { CodeForm } from "./CodeForm";

/**
 * Read codes directly from storage without going through the service worker.
 * This provides instant loading when the popup opens.
 */
const getCachedCodesFromStorage = async (): Promise<{
    codes: Code[];
    timeOffset: number;
} | null> => {
    try {
        // Try session storage first (Chrome MV3)
        if (browser.storage.session) {
            const result = await browser.storage.session.get(["codesCache", "timeOffset"]);
            if (result.codesCache && Array.isArray(result.codesCache)) {
                const offset = typeof result.timeOffset === "number" ? result.timeOffset : 0;
                return {
                    codes: result.codesCache as Code[],
                    timeOffset: offset,
                };
            }
        } else {
            // Fallback for Firefox MV2 (session data stored with prefix in local)
            const result = await browser.storage.local.get(["session_codesCache", "session_timeOffset"]);
            if (result.session_codesCache && Array.isArray(result.session_codesCache)) {
                const offset = typeof result.session_timeOffset === "number" ? result.session_timeOffset : 0;
                return {
                    codes: result.session_codesCache as Code[],
                    timeOffset: offset,
                };
            }
        }
    } catch (e) {
        console.error("Failed to read cached codes from storage:", e);
    }
    return null;
};

type View = "loading" | "login" | "unlock" | "codes" | "add" | "edit";

export const App: React.FC = () => {
    // Initialize theme
    useTheme();

    const [view, setView] = useState<View>("loading");
    const [codes, setCodes] = useState<Code[]>([]);
    const [filteredCodes, setFilteredCodes] = useState<Code[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [showSearch, setShowSearch] = useState(false);
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [sortOrder, setSortOrder] = useState<"issuer" | "account" | "recent">("issuer");
    const [timeOffset, setTimeOffset] = useState(0);
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [loggingIn, setLoggingIn] = useState(false);
    const [otps, setOtps] = useState<Map<string, { otp: string; nextOtp: string }>>(new Map());
    const [showFabMenu, setShowFabMenu] = useState(false);
    const [editingCode, setEditingCode] = useState<Code | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Code | null>(null);
    const [formInitialData, setFormInitialData] = useState<Partial<Code> | undefined>(undefined);
    const [scanError, setScanError] = useState<string | null>(null);
    const [selectedTag, setSelectedTag] = useState<string>("");
    const [allTags, setAllTags] = useState<string[]>([]);
    const [tagMenuOpen, setTagMenuOpen] = useState<string | null>(null);
    const [editingTagName, setEditingTagName] = useState<string | null>(null);
    const [editTagValue, setEditTagValue] = useState("");
    const [deleteTagConfirm, setDeleteTagConfirm] = useState<string | null>(null);
    const [recentlyPinnedId, setRecentlyPinnedId] = useState<string | null>(null);
    const [exitingPinId, setExitingPinId] = useState<string | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const tagFilterRef = useRef<HTMLDivElement>(null);

    // Check if tag filter bar can scroll
    const checkTagScroll = useCallback(() => {
        const el = tagFilterRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }, []);

    // Update scroll state when tags change
    useEffect(() => {
        checkTagScroll();
    }, [allTags, checkTagScroll]);

    // Scroll tag filter bar
    const scrollTags = (direction: "left" | "right") => {
        const el = tagFilterRef.current;
        if (!el) return;
        const scrollAmount = 100;
        el.scrollBy({
            left: direction === "left" ? -scrollAmount : scrollAmount,
            behavior: "smooth",
        });
    };

    // Check auth state on mount with retry logic for MV3 service worker wake-up
    // First tries to load cached codes for instant display, then verifies auth state
    useEffect(() => {
        const initializePopup = async (): Promise<void> => {
            // Step 1: Try to load cached codes immediately (no service worker needed)
            const cached = await getCachedCodesFromStorage();
            if (cached && cached.codes.length > 0) {
                // Show cached codes instantly while we verify auth in background
                setCodes(cached.codes);
                setFilteredCodes(cached.codes);
                setTimeOffset(cached.timeOffset);

                // Extract tags from cached codes
                const tags = new Set<string>();
                cached.codes.forEach((code) => {
                    code.codeDisplay?.tags?.forEach((tag) => tags.add(tag));
                });
                setAllTags(Array.from(tags).sort());

                setView("codes");
            }

            // Step 2: Verify auth state with service worker (may need to wake up)
            const checkAuth = async (retries = 3): Promise<void> => {
                try {
                    const response = await sendMessage<{
                        success: boolean;
                        data?: AuthState;
                        error?: string;
                    }>({ type: "GET_AUTH_STATE" });

                    if (!response.success || !response.data) {
                        if (retries > 0 && response.error) {
                            await new Promise(r => setTimeout(r, 100));
                            return checkAuth(retries - 1);
                        }
                        setView("login");
                        return;
                    }

                    const { isLoggedIn, isUnlocked } = response.data;

                    if (!isLoggedIn) {
                        // Clear any cached codes we showed - user is logged out
                        setCodes([]);
                        setFilteredCodes([]);
                        setView("login");
                    } else if (!isUnlocked) {
                        // Clear cached codes - vault is locked
                        setCodes([]);
                        setFilteredCodes([]);
                        setView("unlock");
                    } else {
                        // User is authenticated - refresh codes from background
                        // (they may have changed since cache was written)
                        await loadCodes();
                        setView("codes");
                    }
                } catch (e) {
                    if (retries > 0) {
                        await new Promise(r => setTimeout(r, 100));
                        return checkAuth(retries - 1);
                    }
                    console.error("Failed to check auth:", e);
                    // If we showed cached codes, keep showing them
                    // Otherwise show login
                    if (!cached || cached.codes.length === 0) {
                        setView("login");
                    }
                }
            };

            await checkAuth();
        };

        initializePopup();
    }, []);

    // Load codes from background (forces sync by default for fresh data)
    const loadCodes = async (forceSync = true) => {
        try {
            const response = await sendMessage<{
                success: boolean;
                data?: { codes: Code[]; timeOffset: number };
            }>({ type: "GET_CODES", forceSync });

            if (response.success && response.data) {
                setCodes(response.data.codes);
                setFilteredCodes(response.data.codes);
                setTimeOffset(response.data.timeOffset);

                // Extract all unique tags
                const tags = new Set<string>();
                response.data.codes.forEach((code) => {
                    code.codeDisplay?.tags?.forEach((tag) => tags.add(tag));
                });
                setAllTags(Array.from(tags).sort());
            }
        } catch (e) {
            console.error("Failed to load codes:", e);
        }
    };

    // Update OTPs every second (codes only change once per period)
    useEffect(() => {
        if (view !== "codes" || codes.length === 0) return;

        const updateOtpCodes = () => {
            const newOtps = new Map<string, { otp: string; nextOtp: string }>();

            filteredCodes.forEach((code) => {
                const [otp, nextOtp] = generateOTPs(code, timeOffset);
                newOtps.set(code.id, { otp, nextOtp });
            });

            setOtps(newOtps);
        };

        updateOtpCodes();
        const interval = setInterval(updateOtpCodes, 1000);

        return () => clearInterval(interval);
    }, [view, filteredCodes, timeOffset]);

    // Filter and sort codes when search query, tag, or sort order changes
    useEffect(() => {
        let result = searchQuery.trim()
            ? searchCodes(codes, searchQuery)
            : [...codes];

        // Filter by selected tag
        if (selectedTag) {
            result = result.filter((code) =>
                code.codeDisplay?.tags?.includes(selectedTag)
            );
        }

        // Apply sorting (pinned codes always first)
        result.sort((a, b) => {
            // Pinned codes come first
            const aPinned = a.codeDisplay?.pinned ? 1 : 0;
            const bPinned = b.codeDisplay?.pinned ? 1 : 0;
            if (aPinned !== bPinned) {
                return bPinned - aPinned; // Pinned first
            }

            // Then apply regular sort order
            switch (sortOrder) {
                case "issuer":
                    return a.issuer.localeCompare(b.issuer);
                case "account":
                    return (a.account || "").localeCompare(b.account || "");
                case "recent":
                    // Most recently used first (using updatedAt or id as fallback)
                    return (b.id || "").localeCompare(a.id || "");
                default:
                    return 0;
            }
        });

        setFilteredCodes(result);
    }, [searchQuery, codes, sortOrder, selectedTag]);

    // Handle unlock
    const handleUnlock = async () => {
        if (!password.trim()) return;

        setError(null);
        try {
            const response = await sendMessage<{
                success: boolean;
                error?: string;
            }>({
                type: "UNLOCK",
                password,
            });

            if (response.success) {
                setPassword("");
                await loadCodes();
                setView("codes");
            } else {
                setError(response.error || "Invalid password");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to unlock");
        }
    };

    // Handle sync
    const handleSync = async () => {
        setSyncing(true);
        try {
            await sendMessage({ type: "SYNC_CODES" });
            await loadCodes();
        } catch (e) {
            console.error("Sync failed:", e);
        } finally {
            setSyncing(false);
        }
    };

    // Handle lock (keeps credentials, just clears master key)
    const handleLock = async () => {
        await sendMessage({ type: "LOCK" });
        setCodes([]);
        setFilteredCodes([]);
        setView("unlock");
    };

    // Handle logout (clears everything)
    const handleLogout = async () => {
        await sendMessage({ type: "LOGOUT" });
        setCodes([]);
        setFilteredCodes([]);
        setView("login");
    };

    // Handle web login - opens auth.ente.io in a new tab
    const handleWebLogin = async () => {
        setError(null);
        setLoggingIn(true);
        try {
            // Open the tab directly from popup - more reliable across browsers
            // Using window.open as a fallback-safe approach
            window.open("https://auth.ente.io", "_blank");
            // The content script on auth.ente.io will capture credentials
            // and send them back. We'll poll for auth state changes.
            pollForLogin();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to open login page");
            setLoggingIn(false);
        }
    };

    // Poll for login completion after opening web login
    const pollForLogin = () => {
        const checkInterval = setInterval(async () => {
            try {
                const response = await sendMessage<{
                    success: boolean;
                    data?: { isLoggedIn: boolean; isUnlocked: boolean };
                }>({ type: "GET_AUTH_STATE" });

                if (response.success && response.data?.isLoggedIn) {
                    clearInterval(checkInterval);
                    setLoggingIn(false);
                    if (response.data.isUnlocked) {
                        await loadCodes();
                        setView("codes");
                    } else {
                        setView("unlock");
                    }
                }
            } catch (e) {
                // Keep polling
            }
        }, 1000);

        // Stop polling after 5 minutes
        setTimeout(() => {
            clearInterval(checkInterval);
            setLoggingIn(false);
        }, 5 * 60 * 1000);
    };

    // Toggle search
    const toggleSearch = () => {
        setShowSearch(!showSearch);
        if (showSearch) {
            setSearchQuery("");
        }
    };

    // Handle add manually
    const handleAddManually = () => {
        setShowFabMenu(false);
        setFormInitialData(undefined);
        setView("add");
    };

    // Handle scan QR
    const handleScanQR = async () => {
        setShowFabMenu(false);
        setScanError(null);

        try {
            const response = await sendMessage<{
                success: boolean;
                data?: ParsedQRCode;
                error?: string;
            }>({ type: "SCAN_QR_FROM_PAGE" });

            if (response.success && response.data) {
                // Pre-fill form with scanned data
                setFormInitialData({
                    issuer: response.data.issuer,
                    account: response.data.account,
                    secret: response.data.secret,
                    type: response.data.type,
                    algorithm: response.data.algorithm,
                    length: response.data.digits,
                    period: response.data.period,
                    counter: response.data.counter,
                });
                setView("add");
            } else {
                setScanError(response.error || "Failed to scan QR code");
            }
        } catch (e) {
            setScanError(e instanceof Error ? e.message : "Failed to scan QR code");
        }
    };

    // Handle edit code
    const handleEditCode = (code: Code) => {
        setEditingCode(code);
        setFormInitialData(code);
        setView("edit");
    };

    // Handle pin/unpin code (two-phase animation: exit, then enter at new position)
    const handlePinCode = async (code: Code) => {
        // Don't allow re-pinning while animating
        if (exitingPinId) return;

        const newPinned = !code.codeDisplay?.pinned;
        const updatedCodeDisplay = {
            ...code.codeDisplay,
            pinned: newPinned || undefined, // Remove if false
        };

        const updatedCode: Code = {
            ...code,
            codeDisplay: Object.keys(updatedCodeDisplay).some(
                (k) => updatedCodeDisplay[k as keyof typeof updatedCodeDisplay] !== undefined
            )
                ? updatedCodeDisplay
                : undefined,
        };

        // Phase 1: Start exit animation at current position
        setExitingPinId(code.id);

        // Phase 2: After exit animation, update state to move card
        setTimeout(() => {
            setCodes((prevCodes) =>
                prevCodes.map((c) => (c.id === code.id ? updatedCode : c))
            );
            setExitingPinId(null);
            setRecentlyPinnedId(code.id);
            setTimeout(() => setRecentlyPinnedId(null), 350);
        }, 250); // Exit animation duration

        // Sync with backend in the background
        try {
            const response = await sendMessage<{
                success: boolean;
                error?: string;
            }>({
                type: "UPDATE_CODE",
                id: code.id,
                code: {
                    issuer: code.issuer,
                    account: code.account,
                    secret: code.secret,
                    type: code.type,
                    algorithm: code.algorithm,
                    digits: code.length,
                    period: code.period,
                    counter: code.counter,
                    codeDisplay: updatedCode.codeDisplay,
                },
            });

            if (!response.success) {
                // Revert on failure
                setCodes((prevCodes) =>
                    prevCodes.map((c) => (c.id === code.id ? code : c))
                );
                setError(response.error || "Failed to update pin status");
            }
        } catch (e) {
            // Revert on error
            setCodes((prevCodes) =>
                prevCodes.map((c) => (c.id === code.id ? code : c))
            );
            setError(e instanceof Error ? e.message : "Failed to update pin status");
        }
    };

    // Handle delete code (called from edit form)
    const handleDeleteCode = (code: Code) => {
        setDeleteConfirm(code);
    };

    // Confirm delete
    const confirmDelete = async () => {
        if (!deleteConfirm) return;

        try {
            const response = await sendMessage<{
                success: boolean;
                error?: string;
            }>({ type: "DELETE_CODE", id: deleteConfirm.id });

            if (response.success) {
                setDeleteConfirm(null);
                setEditingCode(null);
                setFormInitialData(undefined);
                await loadCodes();
                setView("codes");
            } else {
                setError(response.error || "Failed to delete code");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete code");
        }
    };

    // Handle save code (add or edit)
    const handleSaveCode = async (data: CodeFormData) => {
        if (view === "add") {
            const response = await sendMessage<{
                success: boolean;
                error?: string;
            }>({ type: "CREATE_CODE", code: data });

            if (!response.success) {
                throw new Error(response.error || "Failed to create code");
            }
        } else if (view === "edit" && editingCode) {
            const response = await sendMessage<{
                success: boolean;
                error?: string;
            }>({ type: "UPDATE_CODE", id: editingCode.id, code: data });

            if (!response.success) {
                throw new Error(response.error || "Failed to update code");
            }
        }

        // Reload codes and go back to list
        await loadCodes();
        setView("codes");
        setEditingCode(null);
        setFormInitialData(undefined);
    };

    // Handle cancel form
    const handleCancelForm = () => {
        setView("codes");
        setEditingCode(null);
        setFormInitialData(undefined);
        setScanError(null);
    };

    // Handle edit tag - rename tag across all codes
    const handleEditTag = async () => {
        if (!editingTagName || !editTagValue.trim()) return;

        const newTagName = editTagValue.trim();
        if (newTagName === editingTagName) {
            setEditingTagName(null);
            setEditTagValue("");
            return;
        }

        try {
            // Update all codes that have this tag
            const codesToUpdate = codes.filter((code) =>
                code.codeDisplay?.tags?.includes(editingTagName)
            );

            for (const code of codesToUpdate) {
                const newTags = code.codeDisplay?.tags?.map((t) =>
                    t === editingTagName ? newTagName : t
                );

                await sendMessage<{ success: boolean; error?: string }>({
                    type: "UPDATE_CODE",
                    id: code.id,
                    code: {
                        issuer: code.issuer,
                        account: code.account,
                        secret: code.secret,
                        type: code.type,
                        algorithm: code.algorithm,
                        digits: code.length,
                        period: code.period,
                        counter: code.counter,
                        codeDisplay: {
                            ...code.codeDisplay,
                            tags: newTags,
                        },
                    },
                });
            }

            // Update selected tag if it was the one being edited
            if (selectedTag === editingTagName) {
                setSelectedTag(newTagName);
            }

            await loadCodes();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to rename tag");
        } finally {
            setEditingTagName(null);
            setEditTagValue("");
        }
    };

    // Handle delete tag - remove tag from all codes
    const handleDeleteTag = async () => {
        if (!deleteTagConfirm) return;

        try {
            // Update all codes that have this tag
            const codesToUpdate = codes.filter((code) =>
                code.codeDisplay?.tags?.includes(deleteTagConfirm)
            );

            for (const code of codesToUpdate) {
                const newTags = code.codeDisplay?.tags?.filter((t) => t !== deleteTagConfirm);

                await sendMessage<{ success: boolean; error?: string }>({
                    type: "UPDATE_CODE",
                    id: code.id,
                    code: {
                        issuer: code.issuer,
                        account: code.account,
                        secret: code.secret,
                        type: code.type,
                        algorithm: code.algorithm,
                        digits: code.length,
                        period: code.period,
                        counter: code.counter,
                        codeDisplay: {
                            ...code.codeDisplay,
                            tags: newTags && newTags.length > 0 ? newTags : undefined,
                        },
                    },
                });
            }

            // Clear selected tag if it was the one being deleted
            if (selectedTag === deleteTagConfirm) {
                setSelectedTag("");
            }

            await loadCodes();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete tag");
        } finally {
            setDeleteTagConfirm(null);
        }
    };

    // Render loading state
    if (view === "loading") {
        return (
            <div className="popup-container">
                <div className="auth-container">
                    <div className="auth-logo">
                        <Logo />
                    </div>
                    <div className="auth-title">Loading...</div>
                </div>
            </div>
        );
    }

    // Render login view
    if (view === "login") {
        return (
            <div className="popup-container">
                <div className="auth-container">
                    <div className="auth-logo">
                        <Logo />
                    </div>
                    <div className="auth-title">Ente Auth Extension</div>
                    <div className="auth-description">
                        Secure 2FA autofill from your Ente Auth vault.
                    </div>
                    <div className="auth-form">
                        <button
                            type="button"
                            className="auth-button"
                            onClick={handleWebLogin}
                            disabled={loggingIn}
                        >
                            {loggingIn ? "Waiting for login..." : "Log in with Ente"}
                        </button>
                        {loggingIn && (
                            <div className="auth-hint">
                                Complete login in the browser tab that opened.
                                This popup will update automatically.
                            </div>
                        )}
                        {error && <div className="auth-error">{error}</div>}
                    </div>
                </div>
            </div>
        );
    }

    // Render add/edit form
    if (view === "add" || view === "edit") {
        return (
            <div className="popup-container">
                <CodeForm
                    mode={view}
                    initialData={formInitialData as Code | undefined}
                    allTags={allTags}
                    onSave={handleSaveCode}
                    onCancel={handleCancelForm}
                    onDelete={view === "edit" && editingCode ? () => handleDeleteCode(editingCode) : undefined}
                />

                {/* Delete confirmation modal */}
                {deleteConfirm && (
                    <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-title">Delete Code?</div>
                            <div className="modal-message">
                                Are you sure you want to delete the code for{" "}
                                <strong>{deleteConfirm.issuer}</strong>
                                {deleteConfirm.account && (
                                    <> ({deleteConfirm.account})</>
                                )}
                                ? This cannot be undone.
                            </div>
                            <div className="modal-actions">
                                <button
                                    className="modal-button cancel"
                                    onClick={() => setDeleteConfirm(null)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="modal-button delete"
                                    onClick={confirmDelete}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Render unlock view
    if (view === "unlock") {
        return (
            <div className="popup-container">
                <div className="auth-container">
                    <div className="auth-logo">
                        <Logo />
                    </div>
                    <div className="auth-title">Unlock Vault</div>
                    <div className="auth-description">
                        Enter your password to unlock your auth codes.
                    </div>
                    <form
                        className="auth-form"
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleUnlock();
                        }}
                    >
                        <input
                            type="password"
                            className="auth-input"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                        />
                        <button
                            type="submit"
                            className="auth-button"
                            disabled={!password.trim()}
                        >
                            Unlock
                        </button>
                        {error && <div className="auth-error">{error}</div>}
                    </form>
                    <span className="auth-link" onClick={handleLogout}>
                        Use a different account
                    </span>
                </div>
            </div>
        );
    }

    // Render codes view
    return (
        <div className="popup-container">
            <div className="header">
                <div className="header-left">
                    <button
                        className="icon-button"
                        onClick={() => openOptionsPage()}
                        title="Settings"
                    >
                        <SettingsIcon />
                    </button>
                </div>
                <span className="header-title">Auth</span>
                <div className="header-right">
                    <button
                        className="icon-button"
                        onClick={handleLock}
                        title="Lock"
                    >
                        <LockIcon />
                    </button>
                    <div className="sort-container">
                        <button
                            className={`icon-button ${showSortMenu ? "active" : ""}`}
                            onClick={() => setShowSortMenu(!showSortMenu)}
                            title="Sort order"
                        >
                            <SortIcon />
                        </button>
                        {showSortMenu && (
                            <div className="sort-menu">
                                <div
                                    className={`sort-option ${sortOrder === "issuer" ? "active" : ""}`}
                                    onClick={() => { setSortOrder("issuer"); setShowSortMenu(false); }}
                                >
                                    Issuer
                                    {sortOrder === "issuer" && <CheckIcon />}
                                </div>
                                <div
                                    className={`sort-option ${sortOrder === "account" ? "active" : ""}`}
                                    onClick={() => { setSortOrder("account"); setShowSortMenu(false); }}
                                >
                                    Account
                                    {sortOrder === "account" && <CheckIcon />}
                                </div>
                                <div
                                    className={`sort-option ${sortOrder === "recent" ? "active" : ""}`}
                                    onClick={() => { setSortOrder("recent"); setShowSortMenu(false); }}
                                >
                                    Recently used
                                    {sortOrder === "recent" && <CheckIcon />}
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        className={`icon-button ${showSearch ? "active" : ""}`}
                        onClick={toggleSearch}
                        title="Search"
                    >
                        <SearchIcon />
                    </button>
                </div>
            </div>

            {showSearch && (
                <div className="search-container">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search codes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
            )}

            {/* Tag filter bar */}
            {allTags.length > 0 && (
                <div className="tag-filter-container">
                    {canScrollLeft && (
                        <button
                            className="tag-scroll-btn left"
                            onClick={() => scrollTags("left")}
                        >
                            <ChevronLeftIcon />
                        </button>
                    )}
                    <div
                        className="tag-filter-bar"
                        ref={tagFilterRef}
                        onScroll={checkTagScroll}
                    >
                        <button
                            className={`tag-chip ${selectedTag === "" ? "selected" : ""}`}
                            onClick={() => setSelectedTag("")}
                        >
                            All
                        </button>
                        {allTags.map((tag) => (
                            <button
                                key={tag}
                                className={`tag-chip ${selectedTag === tag ? "selected" : ""}`}
                                onClick={() => setSelectedTag(selectedTag === tag ? "" : tag)}
                            >
                                {tag}
                                {selectedTag === tag && (
                                    <span
                                        className="tag-menu-trigger"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setTagMenuOpen(tagMenuOpen === tag ? null : tag);
                                        }}
                                    >
                                        <MoreIcon />
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    {canScrollRight && (
                        <button
                            className="tag-scroll-btn right"
                            onClick={() => scrollTags("right")}
                        >
                            <ChevronRightIcon />
                        </button>
                    )}
                </div>
            )}

            {/* Tag menu - rendered at root level to avoid z-index issues */}
            {tagMenuOpen && (
                <div className="tag-menu-overlay" onClick={() => setTagMenuOpen(null)}>
                    <div className="tag-menu-popup" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="tag-menu-item"
                            onClick={() => {
                                setEditingTagName(tagMenuOpen);
                                setEditTagValue(tagMenuOpen);
                                setTagMenuOpen(null);
                            }}
                        >
                            <EditSmallIcon />
                            Edit
                        </button>
                        <button
                            className="tag-menu-item delete"
                            onClick={() => {
                                setDeleteTagConfirm(tagMenuOpen);
                                setTagMenuOpen(null);
                            }}
                        >
                            <TrashSmallIcon />
                            Delete
                        </button>
                    </div>
                </div>
            )}

            <div className="codes-list">
                {filteredCodes.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🔐</div>
                        <div className="empty-state-text">
                            {codes.length === 0
                                ? "No codes yet. Click + to add one."
                                : "No codes match your search."}
                        </div>
                    </div>
                ) : (
                    filteredCodes.map((code) => {
                        const otpData = otps.get(code.id) || {
                            otp: "",
                            nextOtp: "",
                        };
                        const isExiting = exitingPinId === code.id;
                        const justMoved = recentlyPinnedId === code.id;
                        return (
                            <div
                                key={code.id}
                                className={`code-card-wrapper ${isExiting ? "exiting" : ""} ${justMoved ? "just-moved" : ""}`}
                            >
                                <CodeCard
                                    code={code}
                                    timeOffset={timeOffset}
                                    otp={otpData.otp}
                                    nextOtp={otpData.nextOtp}
                                    onEdit={handleEditCode}
                                    onPin={handlePinCode}
                                />
                            </div>
                        );
                    })
                )}
            </div>

            {/* Floating Action Button */}
            <div className="fab-container">
                {showFabMenu && (
                    <div className="fab-menu">
                        <button
                            className="fab-menu-item"
                            onClick={handleAddManually}
                        >
                            <span className="menu-label">Enter details manually</span>
                            <span className="menu-icon"><KeyboardIcon /></span>
                        </button>
                        <button
                            className="fab-menu-item"
                            onClick={handleScanQR}
                        >
                            <span className="menu-label">Scan a QR code</span>
                            <span className="menu-icon"><QRIcon /></span>
                        </button>
                    </div>
                )}
                <button
                    className={`fab ${showFabMenu ? "active" : ""}`}
                    onClick={() => setShowFabMenu(!showFabMenu)}
                    title="Add code"
                >
                    <PlusIcon />
                </button>
            </div>

            {/* Scan error toast */}
            {scanError && (
                <div className="scan-error-toast">
                    <span>{scanError}</span>
                    <button onClick={() => setScanError(null)}>×</button>
                </div>
            )}

            {/* Delete confirmation modal */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-title">Delete Code?</div>
                        <div className="modal-message">
                            Are you sure you want to delete the code for{" "}
                            <strong>{deleteConfirm.issuer}</strong>
                            {deleteConfirm.account && (
                                <> ({deleteConfirm.account})</>
                            )}
                            ? This cannot be undone.
                        </div>
                        <div className="modal-actions">
                            <button
                                className="modal-button cancel"
                                onClick={() => setDeleteConfirm(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="modal-button delete"
                                onClick={confirmDelete}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit tag modal */}
            {editingTagName && (
                <div className="modal-overlay" onClick={() => { setEditingTagName(null); setEditTagValue(""); }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-title">Rename Tag</div>
                        <div className="modal-field">
                            <input
                                type="text"
                                className="modal-input"
                                value={editTagValue}
                                onChange={(e) => setEditTagValue(e.target.value)}
                                placeholder="Tag name"
                                autoFocus
                                maxLength={100}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        handleEditTag();
                                    }
                                }}
                            />
                        </div>
                        <div className="modal-actions">
                            <button
                                className="modal-button cancel"
                                onClick={() => { setEditingTagName(null); setEditTagValue(""); }}
                            >
                                Cancel
                            </button>
                            <button
                                className="modal-button save"
                                onClick={handleEditTag}
                                disabled={!editTagValue.trim()}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete tag confirmation modal */}
            {deleteTagConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteTagConfirm(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-title">Delete Tag?</div>
                        <div className="modal-message">
                            Are you sure you want to delete the tag{" "}
                            <strong>"{deleteTagConfirm}"</strong>?
                            This will remove the tag from all codes.
                        </div>
                        <div className="modal-actions">
                            <button
                                className="modal-button cancel"
                                onClick={() => setDeleteTagConfirm(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="modal-button delete"
                                onClick={handleDeleteTag}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Logo component - Ente Auth purple
const Logo: React.FC = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
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

// Settings icon (gear)
const SettingsIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
);

// Lock icon
const LockIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

// Sort icon (lines with varying lengths)
const SortIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="16" y2="12" />
        <line x1="4" y1="18" x2="12" y2="18" />
    </svg>
);

// Search icon
const SearchIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

// Check icon
const CheckIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

// Check icon small (for tag chips)
const CheckSmallIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

// Plus icon for FAB
const PlusIcon: React.FC = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

// QR code icon
const QRIcon: React.FC = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="3" height="3" />
        <rect x="18" y="14" width="3" height="3" />
        <rect x="14" y="18" width="3" height="3" />
        <rect x="18" y="18" width="3" height="3" />
    </svg>
);

// Keyboard icon (for manual entry)
const KeyboardIcon: React.FC = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
        <line x1="6" y1="8" x2="6" y2="8" />
        <line x1="10" y1="8" x2="10" y2="8" />
        <line x1="14" y1="8" x2="14" y2="8" />
        <line x1="18" y1="8" x2="18" y2="8" />
        <line x1="6" y1="12" x2="6" y2="12" />
        <line x1="10" y1="12" x2="10" y2="12" />
        <line x1="14" y1="12" x2="14" y2="12" />
        <line x1="18" y1="12" x2="18" y2="12" />
        <line x1="7" y1="16" x2="17" y2="16" />
    </svg>
);

// More icon (3 dots) for tag menu
const MoreIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="6" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="18" r="2" />
    </svg>
);

// Edit icon small (for tag menu)
const EditSmallIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);

// Trash icon small (for tag menu)
const TrashSmallIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

// Chevron left icon (for tag scroll)
const ChevronLeftIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
    </svg>
);

// Chevron right icon (for tag scroll)
const ChevronRightIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
    </svg>
);
