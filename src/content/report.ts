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
const MAX_ATTR_VALUE = 60;
const MAX_ANCESTORS = 4;
const MAX_CLASSES = 4;

// Attributes left out of the opening tag: the field's contents, and inline
// event handlers and styles, which are long and never part of detection
const OMITTED_ATTRIBUTES = /^(value|style|on.*)$/i;

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

const shorten = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max)}…` : value);

/** e.g. <input type="text" class="otp" data-qa="mfa-code" maxlength="6"> */
const openingTag = (input: HTMLInputElement): string => {
    const attrs = Array.from(input.attributes)
        .filter((attr) => !OMITTED_ATTRIBUTES.test(attr.name))
        .map((attr) => {
            const value = shorten(attr.value.replace(/\s+/g, " "), MAX_ATTR_VALUE).replace(/"/g, "&quot;");
            return value ? `${attr.name}="${value}"` : attr.name;
        });
    return `<${input.tagName.toLowerCase()}${attrs.length ? " " + attrs.join(" ") : ""}>`;
};

/** e.g. ["div.field", "fieldset#otp", "form#verify.mfa-form"], nearest first */
const ancestorChain = (input: HTMLInputElement): string[] => {
    const chain: string[] = [];
    let node: Element | null = input.parentElement;
    while (node && node !== document.body && chain.length < MAX_ANCESTORS) {
        const id = node.id ? `#${shorten(node.id, 40)}` : "";
        const classes = Array.from(node.classList)
            .slice(0, MAX_CLASSES)
            .map((c) => `.${shorten(c, 40)}`)
            .join("");
        const more = node.classList.length > MAX_CLASSES ? "…" : "";
        chain.push(`${node.tagName.toLowerCase()}${id}${classes}${more}`);
        node = node.parentElement;
    }
    return chain;
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
    openingTag: openingTag(input),
    ancestors: ancestorChain(input),
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
