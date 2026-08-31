import { describe, expect, it } from "vitest";
import { formatHostname, hostnameFromUrl } from "./tab-url";

describe("hostnameFromUrl", () => {
    it("returns the hostname for http(s) pages", () => {
        expect(hostnameFromUrl("https://github.com/ente-io/ente")).toBe("github.com");
        expect(hostnameFromUrl("http://localhost:3000/login")).toBe("localhost");
        expect(hostnameFromUrl("https://www.github.com")).toBe("www.github.com");
        expect(hostnameFromUrl("https://gist.github.com/abc")).toBe("gist.github.com");
    });

    it("returns null for non-http(s) or missing URLs", () => {
        expect(hostnameFromUrl(undefined)).toBeNull();
        expect(hostnameFromUrl(null)).toBeNull();
        expect(hostnameFromUrl("")).toBeNull();
        expect(hostnameFromUrl("not a url")).toBeNull();
        expect(hostnameFromUrl("chrome://extensions")).toBeNull();
        expect(hostnameFromUrl("about:blank")).toBeNull();
        expect(hostnameFromUrl("moz-extension://uuid/popup/index.html")).toBeNull();
        expect(hostnameFromUrl("chrome-extension://id/popup/index.html")).toBeNull();
        expect(hostnameFromUrl("file:///tmp/page.html")).toBeNull();
    });
});

describe("formatHostname", () => {
    it("strips a leading www.", () => {
        expect(formatHostname("www.github.com")).toBe("github.com");
        expect(formatHostname("WWW.GitHub.com")).toBe("GitHub.com");
    });

    it("leaves other hostnames unchanged", () => {
        expect(formatHostname("github.com")).toBe("github.com");
        expect(formatHostname("gist.github.com")).toBe("gist.github.com");
    });
});
