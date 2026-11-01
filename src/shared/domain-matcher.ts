/**
 * Domain matching utilities for matching websites to stored auth codes.
 */
import type { Code, CustomDomainMapping, DomainMatch } from "./types";
import KNOWN_DOMAIN_MAPPINGS from "../data/domain-mappings.json";

/**
 * Runtime storage for custom domain mappings.
 * These are set by the background script from user preferences.
 */
let customMappings: CustomDomainMapping[] = [];

/**
 * Set custom domain mappings for use in matching.
 * Custom mappings take priority over built-in mappings.
 */
export const setCustomMappings = (mappings: CustomDomainMapping[]): void => {
    customMappings = mappings;
};

/**
 * Get the current custom mappings (for testing/debugging).
 */
export const getCustomMappings = (): CustomDomainMapping[] => {
    return customMappings;
};

/**
 * Get the built-in domain mappings (for display in settings).
 */
export const getBuiltInMappings = (): Record<string, string[]> => {
    return KNOWN_DOMAIN_MAPPINGS;
};

/**
 * Common two-part ccTLD second-level domains (e.g. .co.uk, .com.au, .edu.sg).
 */
const SECOND_LEVEL_DOMAINS = new Set([
    "co", "com", "org", "net", "edu", "gov", "ac", "ne", "or", "go", "gen", "firm", "ind", "ltd", "me", "asso"
]);

/**
 * Extract the base domain from a hostname.
 * e.g., "accounts.google.com" -> "google.com"
 *       "sub.evil.co.uk" -> "evil.co.uk"
 */
const getBaseDomain = (hostname: string): string => {
    const parts = hostname.split(".");
    if (parts.length <= 2) return hostname;

    const tld = parts[parts.length - 1]!;
    const sld = parts[parts.length - 2]!;

    // If ccTLD (2 chars) and known second-level domain (e.g. co.uk, com.au)
    if (tld.length === 2 && SECOND_LEVEL_DOMAINS.has(sld)) {
        return parts.length >= 3 ? parts.slice(-3).join(".") : hostname;
    }

    return parts.slice(-2).join(".");
};

/**
 * Normalize issuer name for comparison.
 */
const normalizeIssuer = (issuer: string): string => {
    return issuer
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim();
};

/**
 * Check if a hostname matches a domain (exact or subdomain).
 */
const domainMatches = (hostname: string, domain: string): boolean => {
    return hostname === domain || hostname.endsWith(`.${domain}`);
};

/**
 * Strict minimum confidence threshold required for any autofill suggestion.
 */
export const MIN_MATCH_CONFIDENCE = 0.8;

/**
 * Match codes to a domain.
 *
 * @param codes The list of codes to search.
 * @param domain The domain to match against.
 * @returns Sorted list of matches with confidence scores.
 */
export const matchCodesToDomain = (
    codes: Code[],
    domain: string
): DomainMatch[] => {
    const hostname = domain.toLowerCase();
    const baseDomain = getBaseDomain(hostname);
    const domainName = baseDomain.split(".")[0]!;
    const normalizedDomainName = normalizeIssuer(domainName);
    const matches: DomainMatch[] = [];

    for (const code of codes) {
        const issuer = code.issuer.toLowerCase();
        const normalizedIssuer = normalizeIssuer(code.issuer);
        let confidence = 0;

        // 0. Check custom mappings FIRST (confidence: 0.99, just below exact match)
        // Custom mappings match on exact domain or subdomain
        const customMatch = customMappings.find((mapping) => {
            const mappingDomain = mapping.domain.toLowerCase();
            // Match if the hostname matches the mapping domain exactly or as subdomain
            return domainMatches(hostname, mappingDomain) || hostname === mappingDomain;
        });

        if (customMatch) {
            // Check if this code's issuer matches the custom mapping
            const mappingIssuerNormalized = normalizeIssuer(customMatch.issuer);
            if (
                normalizedIssuer === mappingIssuerNormalized ||
                code.issuer.toLowerCase() === customMatch.issuer.toLowerCase()
            ) {
                confidence = 0.99;
            }
        }

        // 1. Exact match (confidence: 1.0)
        if (confidence === 0) {
            if (issuer === hostname || issuer === baseDomain) {
                confidence = 1.0;
            } else if (domainMatches(hostname, issuer)) {
                // If issuer itself is a domain (e.g., "example.com") and hostname is a subdomain
                confidence = 0.95;
            }
        }

        // 2. Check known mappings
        if (confidence === 0) {
            // First try exact match on normalized issuer
            let knownDomains = KNOWN_DOMAIN_MAPPINGS[normalizedIssuer as keyof typeof KNOWN_DOMAIN_MAPPINGS];

            // If no exact match, check if issuer contains any known key as a whole word
            // This handles cases like "AWS - Adam" or "Adam's AWS Account"
            // but avoids false matches like "paws" matching "aws"
            if (!knownDomains) {
                const lowerIssuer = code.issuer.toLowerCase();
                for (const [key, domains] of Object.entries(KNOWN_DOMAIN_MAPPINGS)) {
                    // Use word boundary regex to match the key as a whole word
                    const wordBoundaryRegex = new RegExp(`\\b${key}\\b`, "i");
                    if (wordBoundaryRegex.test(lowerIssuer)) {
                        knownDomains = domains;
                        break;
                    }
                }
            }

            if (knownDomains) {
                for (const knownDomain of knownDomains) {
                    const matchesExact = hostname === knownDomain;
                    const matchesSubdomain = hostname.endsWith(`.${knownDomain}`);
                    const matchesBase = baseDomain === knownDomain;
                    if (matchesExact || matchesSubdomain || matchesBase) {
                        confidence = 0.95;
                        break;
                    }
                }

                // If an issuer has known domains in KNOWN_DOMAIN_MAPPINGS, and the page
                // hostname does not match any of them, DO NOT fall through to substring
                // or fuzzy matching!
                if (confidence === 0) {
                    continue;
                }
            }
        }

        // 3. Registrable domain match (confidence: 0.85)
        // Matches if:
        // - Hostname matches the base domain or is a subdomain of it,
        //   and the normalized issuer exactly matches the normalized registrable domain name
        //   (e.g., issuer "Vaultwarden" matches "vaultwarden.org" or "vault.vaultwarden.org")
        if (confidence === 0 && normalizedIssuer.length >= 3) {
            if (normalizedIssuer === normalizedDomainName) {
                confidence = 0.85;
            }
        }

        // Require a strict minimum confidence threshold (>= 0.8) for any autofill suggestion
        if (confidence >= MIN_MATCH_CONFIDENCE) {
            // Boost pinned codes slightly within their tier
            const pinnedBoost = code.codeDisplay?.pinned ? 0.001 : 0;
            matches.push({ code, confidence: confidence + pinnedBoost });
        }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    return matches;
};

/**
 * Get the best matching code for a domain.
 */
export const getBestMatch = (
    codes: Code[],
    domain: string
): DomainMatch | undefined => {
    const matches = matchCodesToDomain(codes, domain);
    return matches[0];
};

/**
 * Filter codes matching a search query.
 */
export const searchCodes = (codes: Code[], query: string): Code[] => {
    if (!query.trim()) return codes;

    const lowerQuery = query.toLowerCase().trim();

    return codes.filter((code) => {
        const issuerMatch = code.issuer.toLowerCase().includes(lowerQuery);
        const accountMatch = code.account?.toLowerCase().includes(lowerQuery);
        const noteMatch = code.codeDisplay?.note
            ?.toLowerCase()
            .includes(lowerQuery);

        return issuerMatch || accountMatch || noteMatch;
    });
};
