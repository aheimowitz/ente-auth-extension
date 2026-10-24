/**
 * Accent color picker: a single swatch showing the active accent that opens
 * a popover with the preset accents and a custom color picker
 * (saturation/brightness square, hue slider and hex field).
 */
import React, { useEffect, useRef, useState } from "react";
import { ACCENT_COLORS, resolveAccentColor } from "@shared/useTheme";
import type { AccentTheme } from "@shared/types";

const PRESETS: { value: Exclude<AccentTheme, "custom">; label: string }[] = [
    { value: "duckey", label: "Duckey green" },
    { value: "ente", label: "Ente purple" },
];

const LABELS: Record<AccentTheme, string> = {
    duckey: "Duckey green",
    ente: "Ente purple",
    custom: "Custom",
};

/**
 * Parse "#abc", "abc", "#aabbcc" or "aabbcc" into lowercase "#aabbcc", or null if invalid.
 */
const normalizeHex = (value: string): string | null => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (!m) return null;
    const hex = m[1]!.length === 3 ? m[1]!.split("").map((c) => c + c).join("") : m[1]!;
    return "#" + hex.toLowerCase();
};

interface Hsv {
    h: number; // 0-360
    s: number; // 0-1
    v: number; // 0-1
}

const hexToHsv = (hex: string): Hsv => {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    return { h, s: max ? d / max : 0, v: max };
};

const hsvToHex = ({ h, s, v }: Hsv): string => {
    const f = (n: number) => {
        const k = (n + h / 60) % 6;
        const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
        return Math.round(c * 255).toString(16).padStart(2, "0");
    };
    return `#${f(5)}${f(3)}${f(1)}`;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface ColorPickerProps {
    color: string;
    onChange: (hex: string) => void;
}

/**
 * Saturation/brightness square, hue slider and hex field.
 */
const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange }) => {
    // Keep HSV locally so hue isn't lost when the color is gray or black
    const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color));
    const [hexDraft, setHexDraft] = useState(color.toUpperCase());
    const squareRef = useRef<HTMLDivElement>(null);

    // Sync when the color changes from outside (e.g. the hex field)
    useEffect(() => {
        if (hsvToHex(hsv) !== color.toLowerCase()) setHsv(hexToHsv(color));
        setHexDraft((draft) => (normalizeHex(draft) === color.toLowerCase() ? draft : color.toUpperCase()));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [color]);

    const update = (next: Hsv) => {
        setHsv(next);
        onChange(hsvToHex(next));
    };

    const updateFromPointer = (e: React.PointerEvent) => {
        const rect = squareRef.current!.getBoundingClientRect();
        update({
            ...hsv,
            s: clamp01((e.clientX - rect.left) / rect.width),
            v: clamp01(1 - (e.clientY - rect.top) / rect.height),
        });
    };

    const handleSquareKey = (e: React.KeyboardEvent) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        const moves: Record<string, Partial<Hsv>> = {
            ArrowLeft: { s: clamp01(hsv.s - step) },
            ArrowRight: { s: clamp01(hsv.s + step) },
            ArrowUp: { v: clamp01(hsv.v + step) },
            ArrowDown: { v: clamp01(hsv.v - step) },
        };
        const move = moves[e.key];
        if (move) {
            e.preventDefault();
            update({ ...hsv, ...move });
        }
    };

    const hexValid = normalizeHex(hexDraft) !== null;

    return (
        <div className="color-picker">
            <div
                ref={squareRef}
                className="color-picker-square"
                style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
                tabIndex={0}
                role="slider"
                aria-label="Saturation and brightness"
                aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
                onKeyDown={handleSquareKey}
                onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    updateFromPointer(e);
                }}
                onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) updateFromPointer(e);
                }}
            >
                <span
                    className="color-picker-thumb"
                    style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: color }}
                />
            </div>
            <input
                type="range"
                className="color-picker-hue"
                min={0}
                max={359}
                value={Math.round(hsv.h)}
                aria-label="Hue"
                onChange={(e) => update({ ...hsv, h: Number(e.target.value) })}
            />
            <div className="color-picker-hex-row">
                <span className="color-picker-preview" style={{ backgroundColor: color }} />
                <label className="color-picker-hex-label" htmlFor="accent-hex">Hex</label>
                <input
                    id="accent-hex"
                    type="text"
                    className={`color-picker-hex ${hexValid ? "" : "invalid"}`}
                    value={hexDraft}
                    maxLength={7}
                    spellCheck={false}
                    aria-invalid={!hexValid}
                    onChange={(e) => {
                        setHexDraft(e.target.value);
                        const hex = normalizeHex(e.target.value);
                        if (hex) onChange(hex);
                    }}
                    onBlur={() => setHexDraft(color.toUpperCase())}
                />
            </div>
        </div>
    );
};

interface AccentPickerProps {
    accent: AccentTheme;
    customColor: string;
    onChange: (accent: AccentTheme, customColor: string) => void;
}

export const AccentPicker: React.FC<AccentPickerProps> = ({ accent, customColor, onChange }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click or Escape
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    const activeColor = resolveAccentColor(accent, customColor);

    return (
        <div className="accent-picker" ref={containerRef}>
            <button
                type="button"
                className="accent-swatch selected"
                style={{ backgroundColor: activeColor }}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`Accent color: ${LABELS[accent]}`}
                title={`Accent color: ${LABELS[accent]}`}
                onClick={() => setOpen((o) => !o)}
            />
            {open && (
                <div className="accent-popover" role="dialog" aria-label="Accent color">
                    <div className="accent-popover-title">Accent color</div>
                    {PRESETS.map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            className={`accent-option ${accent === value ? "active" : ""}`}
                            aria-pressed={accent === value}
                            onClick={() => onChange(value, customColor)}
                        >
                            <span className="accent-option-swatch" style={{ backgroundColor: ACCENT_COLORS[value] }} />
                            {label}
                        </button>
                    ))}
                    <div className="accent-divider" />
                    <button
                        type="button"
                        className={`accent-option ${accent === "custom" ? "active" : ""}`}
                        aria-pressed={accent === "custom"}
                        aria-expanded={accent === "custom"}
                        onClick={() => onChange("custom", customColor)}
                    >
                        <span className="accent-option-swatch custom" style={{ backgroundColor: customColor }} />
                        Custom color
                        <ChevronIcon open={accent === "custom"} />
                    </button>
                    {accent === "custom" && (
                        <ColorPicker color={customColor} onChange={(hex) => onChange("custom", hex)} />
                    )}
                </div>
            )}
        </div>
    );
};

const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
    <svg
        className="accent-option-chevron"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ transform: open ? "rotate(180deg)" : undefined }}
    >
        <polyline points="6 9 12 15 18 9" />
    </svg>
);
