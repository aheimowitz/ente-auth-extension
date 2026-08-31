/**
 * Pure filtering/sorting for the popup codes list.
 * Default: only codes that match the current site. Search looks across the full vault.
 */
import { matchCodesToDomain, searchCodes } from "@shared/domain-matcher";
import type { Code } from "@shared/types";

export type PopupSortOrder = "issuer" | "account" | "recent";

export interface FilterPopupCodesOptions {
    codes: Code[];
    currentDomain: string | null;
    showAllCodes: boolean;
    searchQuery: string;
    selectedTag: string;
    sortOrder: PopupSortOrder;
}

export const filterPopupCodes = ({
    codes,
    currentDomain,
    showAllCodes,
    searchQuery,
    selectedTag,
    sortOrder,
}: FilterPopupCodesOptions): Code[] => {
    const query = searchQuery.trim();
    const filteringBySite = Boolean(currentDomain) && !showAllCodes && !query;

    let result: Code[];
    if (query) {
        result = searchCodes(codes, searchQuery);
    } else if (filteringBySite && currentDomain) {
        result = matchCodesToDomain(codes, currentDomain).map((m) => m.code);
    } else {
        result = [...codes];
    }

    if (selectedTag) {
        result = result.filter((code) =>
            code.codeDisplay?.tags?.includes(selectedTag)
        );
    }

    if (!filteringBySite) {
        result.sort((a, b) => {
            const aPinned = a.codeDisplay?.pinned ? 1 : 0;
            const bPinned = b.codeDisplay?.pinned ? 1 : 0;
            if (aPinned !== bPinned) {
                return bPinned - aPinned;
            }

            switch (sortOrder) {
                case "issuer":
                    return a.issuer.localeCompare(b.issuer);
                case "account":
                    return (a.account || "").localeCompare(b.account || "");
                case "recent":
                    return (b.id || "").localeCompare(a.id || "");
                default:
                    return 0;
            }
        });
    }

    return result;
};
