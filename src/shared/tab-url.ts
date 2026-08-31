/**
 * Parse a tab URL into a hostname used for site-filtered codes.
 * Returns null for missing, invalid, or non-http(s) URLs (new tab, chrome://, etc.).
 */
export const hostnameFromUrl = (url: string | undefined | null): string | null => {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        return parsed.hostname;
    } catch {
        return null;
    }
};

/** Strip leading www. for compact display in the popup. */
export const formatHostname = (hostname: string): string =>
    hostname.replace(/^www\./i, "");
