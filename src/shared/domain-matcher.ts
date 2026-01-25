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
 * Calculate Levenshtein distance between two strings.
 */
const levenshteinDistance = (a: string, b: string): number => {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0]![j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i]![j] = matrix[i - 1]![j - 1]!;
            } else {
                matrix[i]![j] = Math.min(
                    matrix[i - 1]![j - 1]! + 1,
                    matrix[i]![j - 1]! + 1,
                    matrix[i - 1]![j]! + 1
                );
            }
        }
    }

    return matrix[b.length]![a.length]!;
};

/**
 * Calculate similarity between two strings (0-1).
 */
const similarity = (a: string, b: string): number => {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    return 1 - distance / maxLen;
};

/**
 * Extract the base domain from a hostname.
 * e.g., "accounts.google.com" -> "google.com"
 */
const getBaseDomain = (hostname: string): string => {
    const parts = hostname.split(".");
    if (parts.length <= 2) return hostname;
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
        if (confidence === 0 && (issuer === hostname || issuer === baseDomain)) {
            confidence = 1.0;
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
            }
        }

        // 3. Subdomain/partial match (confidence: 0.8)
        // Only apply partial matching if issuer is at least 4 chars to avoid false positives
        if (confidence === 0 && normalizedIssuer.length >= 4) {
            const domainName = baseDomain.split(".")[0]!;

            // Check various partial match scenarios:
            // - hostname contains the issuer (e.g., "snowflakecomputing.com" contains "snowflake")
            // - issuer contains the domain name (e.g., issuer "GitHub Enterprise" contains "github")
            // - domain name starts with issuer (e.g., "snowflakecomputing" starts with "snowflake")
            // - issuer starts with domain name (e.g., "githubenterprise" starts with "github")
            if (
                hostname.includes(normalizedIssuer) ||
                normalizedIssuer.includes(domainName) ||
                domainName.startsWith(normalizedIssuer) ||
                normalizedIssuer.startsWith(domainName)
            ) {
                confidence = 0.8;
            }
        }

        // 4. Fuzzy match with Levenshtein (confidence based on similarity)
        if (confidence === 0) {
            const baseDomainName = baseDomain.split(".")[0]!;
            const sim = similarity(normalizedIssuer, baseDomainName);
            if (sim > 0.7) {
                confidence = sim * 0.7; // Scale to max 0.49
            }
        }

        if (confidence > 0) {
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
