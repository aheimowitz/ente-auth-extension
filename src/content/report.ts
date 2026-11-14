/**
 * Collect the page details a "Report a problem" bug report needs: the
 * structure of the relevant input fields and the detector's verdict on them.
 *
 * Never reads input values, page text beyond short labels, cookies or storage.
 * The user reviews everything on the report page before anything is shared.
 */
import { diagnoseField, getBestMFAField } from "./detector";
import type { FieldDiagnosis, PageReport, ReportedField } from "@shared/types";

const MAX_TEXT = 80;
const MAX_FORM_INPUTS = 15;

const clip = (value: string | null | undefined): string | undefined => {
    const text = value?.replace(/\s+/g, " ").trim();
    if (!text) return undefined;
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
};

const labelText = (input: HTMLInputElement): string | undefined => {
    const fromLabels = input.labels?.[0]?.textContent;
    if (fromLabels) return clip(fromLabels);
    const labelledBy = input.getAttribute("aria-labelledby");
    if (labelledBy) {
        const el = document.getElementById(labelledBy.split(/\s+/)[0]!);
        if (el) return clip(el.textContent);
    }
    return undefined;
};

const describeField = (input: HTMLInputElement, diagnosis?: FieldDiagnosis): ReportedField => ({
    type: input.getAttribute("type") ?? "(none)",
    name: clip(input.name),
    id: clip(input.id),
    autocomplete: clip(input.getAttribute("autocomplete")),
    inputmode: clip(input.getAttribute("inputmode")),
    maxlength: input.maxLength > 0 ? input.maxLength : undefined,
    pattern: clip(input.getAttribute("pattern")),
    placeholder: clip(input.placeholder),
    ariaLabel: clip(input.getAttribute("aria-label")),
    label: labelText(input),
    inShadowRoot: input.getRootNode() instanceof ShadowRoot,
    diagnosis,
});

/** Closest heading above the field, to show what the page was asking for */
const nearbyHeading = (from: Element | null): string | undefined => {
    let node: Element | null = from;
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
        const heading = node.querySelector("h1, h2, h3, legend");
        if (heading?.textContent) return clip(heading.textContent);
    }
    return clip(document.querySelector("h1, h2")?.textContent);
};

export const collectPageReport = (target: HTMLInputElement | null): PageReport => {
    const best = getBestMFAField();
    const container = target?.closest("form") ?? best?.element.closest("form") ?? null;

    const inputs = Array.from(
        (container ?? document).querySelectorAll<HTMLInputElement>("input:not([type=hidden])")
    ).filter((input) => input.offsetParent !== null);

    return {
        hostname: location.hostname,
        url: location.href,
        inIframe: window.top !== window,
        heading: nearbyHeading(target ?? best?.element ?? null),
        target: target ? describeField(target, diagnoseField(target)) : undefined,
        detected: best
            ? {
                  kind: best.type,
                  boxes: best.splitInputs?.length,
                  confidence: Math.round(best.confidence * 100) / 100,
                  field: best.element === target ? undefined : describeField(best.element),
              }
            : undefined,
        formInputs: {
            scope: container ? "form" : "page",
            total: inputs.length,
            fields: inputs.slice(0, MAX_FORM_INPUTS).map((input) => ({
                type: input.getAttribute("type") ?? "(none)",
                autocomplete: clip(input.getAttribute("autocomplete")),
                maxlength: input.maxLength > 0 ? input.maxLength : undefined,
            })),
        },
    };
};
