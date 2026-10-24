/**
 * React hook for theme management.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import { sendMessage } from "@shared/browser";
import { ACCENT_COLORS, resolveAccentColor } from "@shared/accent";
import type { AccentTheme, ExtensionSettings, ThemeMode } from "@shared/types";

export { ACCENT_COLORS, resolveAccentColor };

type ResolvedTheme = "light" | "dark";


/**
 * Get the current system color scheme preference.
 */
const getSystemPreference = (): ResolvedTheme => {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
};

/**
 * Apply theme class to document.
 */
const applyTheme = (theme: ResolvedTheme): void => {
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(`theme-${theme}`);
};

/**
 * Apply accent class to document. A custom accent sets --accent inline;
 * theme.css derives the hover and pin colors from it.
 */
export const applyAccent = (accent: AccentTheme, customColor: string): void => {
    const root = document.documentElement;
    root.classList.remove("accent-duckey", "accent-ente", "accent-custom");
    root.classList.add(`accent-${accent}`);
    if (accent === "custom") {
        root.style.setProperty("--accent", customColor);
    } else {
        root.style.removeProperty("--accent");
    }
};

/**
 * Hook to manage and apply theme settings.
 * - Loads theme from settings
 * - Detects system preference when mode is "system"
 * - Applies theme class to document
 * - Listens for system preference changes
 * - Applies the accent class; `forceAccent` overrides the user's setting
 */
export const useTheme = (forceAccent?: AccentTheme): {
    theme: ThemeMode;
    resolvedTheme: ResolvedTheme;
    accent: AccentTheme;
} => {
    // Initialize system preference synchronously to avoid flash
    const [systemPreference, setSystemPreference] = useState<ResolvedTheme>(
        getSystemPreference
    );
    const [theme, setTheme] = useState<ThemeMode>("system");
    const [accentSetting, setAccentSetting] = useState<AccentTheme>("duckey");
    const [customColor, setCustomColor] = useState("#2F6FDE");
    const accent = forceAccent ?? accentSetting;
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    // Resolve the actual theme to apply
    const resolvedTheme: ResolvedTheme =
        theme === "system" ? systemPreference : theme;

    // Apply theme immediately on mount and when it changes
    // Using useLayoutEffect to apply before browser paint
    useLayoutEffect(() => {
        applyTheme(resolvedTheme);
    }, [resolvedTheme]);

    useLayoutEffect(() => {
        applyAccent(accent, customColor);
    }, [accent, customColor]);

    // Load theme from settings
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const response = await sendMessage<{
                    success: boolean;
                    data?: ExtensionSettings;
                }>({ type: "GET_SETTINGS" });

                if (response.success && response.data) {
                    setTheme(response.data.theme);
                    setAccentSetting(response.data.accentTheme ?? "duckey");
                    setCustomColor(response.data.accentCustomColor ?? "#2F6FDE");
                }
            } catch (e) {
                // Silently ignore connection errors (service worker waking up)
                const errorMessage = e instanceof Error ? e.message : String(e);
                if (!errorMessage.includes("Could not establish connection") &&
                    !errorMessage.includes("Receiving end does not exist")) {
                    console.error("Failed to load theme:", e);
                }
            } finally {
                setSettingsLoaded(true);
            }
        };

        loadTheme();
    }, []);

    // Listen for system preference changes
    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

        const handleChange = (e: MediaQueryListEvent) => {
            setSystemPreference(e.matches ? "dark" : "light");
        };

        mediaQuery.addEventListener("change", handleChange);

        return () => {
            mediaQuery.removeEventListener("change", handleChange);
        };
    }, []);

    return { theme, resolvedTheme, accent };
};

/**
 * Get resolved theme (for content scripts).
 * Returns the theme that should be applied based on settings and system preference.
 */
export const getResolvedTheme = async (): Promise<ResolvedTheme> => {
    try {
        const response = await sendMessage<{
            success: boolean;
            data?: ExtensionSettings;
        }>({ type: "GET_SETTINGS" });

        const themeSetting = response.data?.theme ?? "system";

        if (themeSetting === "system") {
            return getSystemPreference();
        }

        return themeSetting;
    } catch {
        return "dark";
    }
};

/**
 * Get the accent color as a hex value (for content scripts).
 */
export const getResolvedAccentColor = async (): Promise<string> => {
    try {
        const response = await sendMessage<{
            success: boolean;
            data?: ExtensionSettings;
        }>({ type: "GET_SETTINGS" });

        return resolveAccentColor(
            response.data?.accentTheme ?? "duckey",
            response.data?.accentCustomColor ?? "#2F6FDE"
        );
    } catch {
        return ACCENT_COLORS.duckey;
    }
};
