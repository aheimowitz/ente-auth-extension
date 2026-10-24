/**
 * Accent colors. Kept free of React so the background script can use them.
 */
import type { AccentTheme } from "@shared/types";

/**
 * Accent color for each preset accent theme. Keep in sync with the .accent-* rules in theme.css.
 */
export const ACCENT_COLORS: Record<Exclude<AccentTheme, "custom">, string> = {
    duckey: "#0F7A68",
    ente: "#8F33D6",
};

/**
 * Resolve the accent color to a hex value.
 */
export const resolveAccentColor = (accent: AccentTheme, customColor: string): string =>
    accent === "custom" ? customColor : ACCENT_COLORS[accent];
