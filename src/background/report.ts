/**
 * "Report a problem" flow: gather what a bug report needs from the page and
 * the extension, then open the report page where the user reviews it and
 * opens a prefilled GitHub issue. Nothing is sent anywhere from here.
 */
import type Browser from "webextension-polyfill";
import { browser } from "@shared/browser";
import { matchCodesToDomain, setCustomMappings } from "@shared/domain-matcher";
import type { PageReport, ProblemReport } from "@shared/types";
import { getAuthState } from "./auth";
import { customMappingsStorage, sessionStore, settingsStorage } from "./storage";
import { getCodes } from "./sync";

const REPORT_KEY = "problemReport";

const hostnameOf = (url: string | undefined): string | undefined => {
    try {
        return url ? new URL(url).hostname || undefined : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Which field the page report describes besides the detected one: the
 * right-clicked input, the input a detection-problem prompt is about, or none.
 */
type ReportTarget = "context" | "prompt" | "none";

const reportTargetFor = (source: ProblemReport["source"]): ReportTarget =>
    source === "field"
        ? "context"
        : source === "missed-field" || source === "wrong-field"
          ? "prompt"
          : "none";

const collectFromPage = async (
    tabId: number,
    target: ReportTarget,
    frameId: number
): Promise<PageReport | undefined> => {
    try {
        return (await browser.tabs.sendMessage(
            tabId,
            { type: "COLLECT_PAGE_REPORT", target },
            { frameId }
        )) as PageReport;
    } catch {
        return undefined;
    }
};

export const startProblemReport = async (
    tab: Browser.Tabs.Tab | undefined,
    source: ProblemReport["source"],
    frameId: number | undefined
): Promise<void> => {
    let page: PageReport | undefined;
    if (tab?.id !== undefined) {
        const target = reportTargetFor(source);
        page = await collectFromPage(tab.id, target, target === "none" ? 0 : frameId ?? 0);
        // The content script only runs in the top frame; for a field inside an
        // iframe, fall back to the top frame's view of the page
        if (!page && frameId) page = await collectFromPage(tab.id, "none", 0);
    }

    const settings = await settingsStorage.getSettings();
    const hostname = page?.hostname ?? hostnameOf(tab?.url);

    let matches: ProblemReport["matches"];
    if (hostname) {
        const auth = await getAuthState();
        if (!auth.isUnlocked) {
            matches = "locked";
        } else {
            setCustomMappings(await customMappingsStorage.getMappings());
            const found = matchCodesToDomain(await getCodes(), hostname);
            matches = {
                count: found.length,
                topConfidence: found[0] ? Math.round(found[0].confidence * 100) / 100 : undefined,
            };
        }
    }

    const report: ProblemReport = {
        source,
        createdAt: Date.now(),
        extensionVersion: browser.runtime.getManifest().version,
        userAgent: navigator.userAgent,
        page,
        tabUrl: tab?.url,
        settings: {
            showAutofillIcon: settings.showAutofillIcon,
            autoFillSingleMatch: settings.autoFillSingleMatch,
            autoSubmit: settings.autoSubmit,
        },
        matches,
    };

    await sessionStore.set(REPORT_KEY, report);
    await browser.tabs.create({ url: browser.runtime.getURL("report/index.html") });
};

export const getProblemReport = (): Promise<ProblemReport | undefined> => sessionStore.get<ProblemReport>(REPORT_KEY);
