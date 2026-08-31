import { afterEach, describe, expect, it } from "vitest";
import { setCustomMappings } from "@shared/domain-matcher";
import type { Code } from "@shared/types";
import { filterPopupCodes } from "./filter-codes";

const makeCode = (partial: Partial<Code> & Pick<Code, "id" | "issuer">): Code => ({
    type: "totp",
    length: 6,
    period: 30,
    algorithm: "sha1",
    secret: "JBSWY3DPEHPK3PXP",
    codeDisplay: undefined,
    uriString: `otpauth://totp/${encodeURIComponent(partial.issuer)}`,
    ...partial,
});

const github = makeCode({ id: "gh", issuer: "GitHub", account: "zeta@example.com" });
const google = makeCode({ id: "goog", issuer: "Google", account: "alpha@example.com" });
const amazon = makeCode({ id: "amz", issuer: "Amazon", account: "beta@example.com" });
const codes = [amazon, github, google];

const defaults = {
    codes,
    currentDomain: "github.com" as string | null,
    showAllCodes: false,
    searchQuery: "",
    selectedTag: "",
    sortOrder: "issuer" as const,
};

afterEach(() => {
    setCustomMappings([]);
});

describe("filterPopupCodes", () => {
    it("shows only codes for the current site by default", () => {
        const result = filterPopupCodes(defaults);
        expect(result.map((c) => c.id)).toEqual(["gh"]);
    });

    it("shows the full vault when Show all is on", () => {
        const result = filterPopupCodes({ ...defaults, showAllCodes: true });
        expect(result.map((c) => c.id)).toEqual(["amz", "gh", "goog"]);
    });

    it("shows the full vault when there is no current site", () => {
        const result = filterPopupCodes({ ...defaults, currentDomain: null });
        expect(result.map((c) => c.id)).toEqual(["amz", "gh", "goog"]);
    });

    it("searches the full vault even while on a site", () => {
        const result = filterPopupCodes({
            ...defaults,
            searchQuery: "google",
        });
        expect(result.map((c) => c.id)).toEqual(["goog"]);
    });

    it("returns an empty list when the site has no matching codes", () => {
        const result = filterPopupCodes({
            ...defaults,
            currentDomain: "example.com",
        });
        expect(result).toEqual([]);
    });

    it("applies tag filter on top of the site filter", () => {
        const taggedGithub = makeCode({
            id: "gh-work",
            issuer: "GitHub",
            codeDisplay: { tags: ["work"] },
        });
        const result = filterPopupCodes({
            ...defaults,
            codes: [github, taggedGithub, google],
            selectedTag: "work",
        });
        expect(result.map((c) => c.id)).toEqual(["gh-work"]);
    });

    it("keeps domain-match ranking instead of issuer sort on the current site", () => {
        const exact = makeCode({ id: "exact", issuer: "github.com" });
        const mapped = makeCode({ id: "mapped", issuer: "GitHub" });
        const result = filterPopupCodes({
            ...defaults,
            codes: [mapped, exact],
            sortOrder: "issuer",
        });
        expect(result[0]!.id).toBe("exact");
        expect(result[0]!.issuer).toBe("github.com");
    });

    it("sorts by account when showing all", () => {
        const result = filterPopupCodes({
            ...defaults,
            showAllCodes: true,
            sortOrder: "account",
        });
        expect(result.map((c) => c.account)).toEqual([
            "alpha@example.com",
            "beta@example.com",
            "zeta@example.com",
        ]);
    });

    it("puts pinned codes first when showing all", () => {
        const pinned = makeCode({
            id: "pinned-goog",
            issuer: "Google",
            codeDisplay: { pinned: true },
        });
        const result = filterPopupCodes({
            ...defaults,
            codes: [amazon, pinned, github],
            showAllCodes: true,
        });
        expect(result[0]!.id).toBe("pinned-goog");
    });
});
