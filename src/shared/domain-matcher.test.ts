import { afterEach, describe, expect, it } from "vitest";
import {
    matchCodesToDomain,
    searchCodes,
    setCustomMappings,
} from "./domain-matcher";
import type { Code } from "./types";

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

afterEach(() => {
    setCustomMappings([]);
});

describe("matchCodesToDomain", () => {
    const github = makeCode({ id: "gh", issuer: "GitHub", account: "me@example.com" });
    const google = makeCode({ id: "goog", issuer: "Google" });
    const amazon = makeCode({ id: "amz", issuer: "Amazon" });
    const oktaWork = makeCode({ id: "okta", issuer: "Okta - Work" });

    it("matches an issuer equal to the hostname or base domain", () => {
        const exact = makeCode({ id: "gh", issuer: "github.com" });
        const matches = matchCodesToDomain([exact, google], "github.com");
        expect(matches.map((m) => m.code.id)).toEqual(["gh"]);
        expect(matches[0]!.confidence).toBe(1);
    });

    it("matches known issuer mappings including subdomains", () => {
        const onGithub = matchCodesToDomain([github, google, amazon], "github.com");
        expect(onGithub.map((m) => m.code.id)).toEqual(["gh"]);

        const onGist = matchCodesToDomain([github, google], "gist.github.com");
        expect(onGist.map((m) => m.code.id)).toEqual(["gh"]);

        const onYoutube = matchCodesToDomain([github, google], "youtube.com");
        expect(onYoutube.map((m) => m.code.id)).toEqual(["goog"]);
    });

    it("matches issuers that contain a known mapping as a whole word", () => {
        const awsWork = makeCode({ id: "aws", issuer: "AWS - Adam" });
        const paws = makeCode({ id: "paws", issuer: "paws" });
        const matches = matchCodesToDomain([awsWork, paws], "aws.amazon.com");
        expect(matches.map((m) => m.code.id)).toEqual(["aws"]);
    });

    it("does not match unrelated issuers", () => {
        const matches = matchCodesToDomain([github, google], "amazon.com");
        expect(matches).toEqual([]);
    });

    it("applies custom mappings ahead of built-in ones", () => {
        setCustomMappings([
            { domain: "sso.mycompany.com", issuer: "Okta - Work", createdAt: 1 },
        ]);
        const matches = matchCodesToDomain(
            [oktaWork, google],
            "sso.mycompany.com"
        );
        expect(matches.map((m) => m.code.id)).toEqual(["okta"]);
        expect(matches[0]!.confidence).toBe(0.99);
    });

    it("boosts pinned codes within the same match tier", () => {
        const personal = makeCode({ id: "gh-personal", issuer: "GitHub" });
        const work = makeCode({
            id: "gh-work",
            issuer: "GitHub",
            codeDisplay: { pinned: true },
        });
        const matches = matchCodesToDomain([personal, work], "github.com");
        expect(matches.map((m) => m.code.id)).toEqual(["gh-work", "gh-personal"]);
    });
});

describe("searchCodes", () => {
    const codes = [
        makeCode({ id: "gh", issuer: "GitHub", account: "me@example.com" }),
        makeCode({
            id: "goog",
            issuer: "Google",
            codeDisplay: { note: "personal gmail" },
        }),
    ];

    it("returns all codes for an empty query", () => {
        expect(searchCodes(codes, "  ")).toEqual(codes);
    });

    it("filters by issuer, account, or note", () => {
        expect(searchCodes(codes, "github").map((c) => c.id)).toEqual(["gh"]);
        expect(searchCodes(codes, "me@example").map((c) => c.id)).toEqual(["gh"]);
        expect(searchCodes(codes, "gmail").map((c) => c.id)).toEqual(["goog"]);
    });
});
