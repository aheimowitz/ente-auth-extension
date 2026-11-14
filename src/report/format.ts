/**
 * Turn a collected problem report into a GitHub issue title and Markdown body.
 */
import type { FieldDiagnosis, ProblemReport, ReportedField } from "@shared/types";

const describeBrowser = (ua: string): string => {
    const pick = (re: RegExp, name: string) => {
        const m = re.exec(ua);
        return m ? `${name} ${m[1]}` : null;
    };
    const browserName =
        pick(/Edg\/([\d.]+)/, "Edge") ??
        pick(/Firefox\/([\d.]+)/, "Firefox") ??
        pick(/Chrome\/([\d.]+)/, "Chrome") ??
        pick(/Version\/([\d.]+).*Safari/, "Safari") ??
        "Unknown browser";
    const os = /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Android/.test(ua)
            ? "Android"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown OS";
    return `${browserName} on ${os}`;
};

const onOff = (v: boolean) => (v ? "on" : "off");

const verdict = (d: FieldDiagnosis): string => {
    if (d.skipped) return `skipped: ${d.skipped}`;
    if (d.isBestMatch) {
        return d.inSplitGroup
            ? "picked as one box of a split code field"
            : `picked as the code field (confidence ${d.confidence.toFixed(2)})`;
    }
    if (d.inSplitGroup) return "part of a detected split field, but not picked";
    if (d.excluded) {
        return `excluded as an SMS / email / non-MFA code field: ${d.exclusionReason ?? "unknown reason"}`;
    }
    return `not picked (confidence ${d.confidence.toFixed(2)}, needs 0.50)`;
};

const fieldTable = (field: ReportedField): string => {
    const rows: [string, string | number | undefined][] = [
        ["type", field.type],
        ["name", field.name],
        ["id", field.id],
        ["autocomplete", field.autocomplete],
        ["inputmode", field.inputmode],
        ["maxlength", field.maxlength],
        ["pattern", field.pattern],
        ["placeholder", field.placeholder],
        ["aria-label", field.ariaLabel],
        ["label", field.label],
    ];
    const lines = rows
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `| ${k} | \`${String(v).replace(/[|`]/g, " ")}\` |`);
    if (field.inShadowRoot) lines.push("| shadow DOM | yes |");
    if (field.diagnosis) lines.push(`| detector | ${verdict(field.diagnosis).replace(/\|/g, "/")} |`);
    if (field.ancestors?.length) {
        lines.push(`| parents | \`${field.ancestors.join(" < ").replace(/[|`]/g, " ")}\` |`);
    }
    const table = ["| Attribute | Value |", "|---|---|", ...lines].join("\n");
    if (!field.openingTag) return table;
    // Fence longer than any backtick run in the tag, so attribute values can't end it early
    const longestRun = Math.max(0, ...(field.openingTag.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    return `${table}\n\n${fence}html\n${field.openingTag}\n${fence}`;
};

export const formatTitle = (report: ProblemReport): string => {
    const host = report.page?.hostname ?? (report.tabUrl ? safeHost(report.tabUrl) : undefined);
    const what = report.source === "field" ? "Field not filled" : "Autofill problem";
    return host ? `${what} on ${host}` : what;
};

const safeHost = (url: string): string | undefined => {
    try {
        return new URL(url).hostname || undefined;
    } catch {
        return undefined;
    }
};

export const formatBody = (
    report: ProblemReport,
    description: string,
    includeFullUrl: boolean
): string => {
    const page = report.page;
    const host = page?.hostname ?? (report.tabUrl ? safeHost(report.tabUrl) : undefined);
    const out: string[] = [];

    out.push("### What happened", description.trim() || "_No description given._", "");

    out.push("### Site");
    out.push(host ? `\`${host}\`` : "_Unknown_");
    if (includeFullUrl && (page?.url || report.tabUrl)) out.push(`Full address: \`${page?.url ?? report.tabUrl}\``);
    if (page?.heading) out.push(`Heading near the field: "${page.heading}"`);
    if (page?.inIframe) out.push("The field is inside an iframe.");
    out.push("");

    out.push("### Environment");
    out.push(`- Duckey ${report.extensionVersion}`);
    out.push(`- ${describeBrowser(report.userAgent)}`);
    if (report.settings) {
        out.push(
            `- Autofill icon ${onOff(report.settings.showAutofillIcon)}, ` +
                `auto-fill single match ${onOff(report.settings.autoFillSingleMatch)}, ` +
                `auto-submit ${onOff(report.settings.autoSubmit)}`
        );
    }
    if (report.matches === "locked") out.push("- Codes matching this site: unknown (vault was locked)");
    else if (report.matches) {
        const top = report.matches.topConfidence !== undefined ? ` (best match ${report.matches.topConfidence})` : "";
        out.push(`- Codes matching this site: ${report.matches.count}${top}`);
    }
    out.push("");

    if (!page) {
        out.push(
            "_Duckey couldn't read this page (browser pages, extension stores and some iframes are off limits), so no field details are included._"
        );
        return out.join("\n");
    }

    if (page.target) {
        out.push("### Field I right-clicked", fieldTable(page.target), "");
    }

    out.push("### Field Duckey detected");
    if (!page.detected) out.push("None. Duckey didn't find a code field on this page.");
    else {
        const kind =
            page.detected.kind === "split" ? `split field (${page.detected.boxes ?? "?"} boxes)` : "single field";
        out.push(`${kind}, confidence ${page.detected.confidence}`);
        if (page.detected.field) out.push("", fieldTable(page.detected.field));
        else if (page.target) out.push("Same field as above.");
    }
    out.push("");

    const { formInputs } = page;
    out.push(`### Inputs in the ${formInputs.scope} (${formInputs.total})`);
    if (formInputs.fields.length === 0) out.push("None visible.");
    for (const f of formInputs.fields) {
        const extras = [
            f.autocomplete ? `autocomplete=${f.autocomplete}` : null,
            f.maxlength ? `maxlength=${f.maxlength}` : null,
        ].filter(Boolean);
        out.push(`- \`${f.type}\`${extras.length ? ` (${extras.join(", ")})` : ""}`);
    }
    if (formInputs.total > formInputs.fields.length) {
        out.push(`- …and ${formInputs.total - formInputs.fields.length} more`);
    }

    return out.join("\n");
};
