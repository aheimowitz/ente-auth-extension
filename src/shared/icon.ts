/**
 * Draws the Duckey duck-key icon in any accent color, so the toolbar icon and
 * the autofill field icon can follow the user's accent setting.
 * Geometry matches branding/duckey.svg (128x128 viewBox).
 */
import { browser } from "@shared/browser";
import { ACCENT_COLORS } from "@shared/accent";

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const BILL = "M36 56 C22 53 9 56 9 64 C9 72 22 75 36 72 Z";
const KEY_BLADE =
    "M60 55 H112 a4 4 0 0 1 4 4 V67 a4 4 0 0 1 -4 4 H108 V84 a3 3 0 0 1 -3 3 H99 a3 3 0 0 1 -3 -3 V71 H90 V79 a3 3 0 0 1 -3 3 H81 a3 3 0 0 1 -3 -3 V71 H60 Z";
const CREAM = "#FFF6E0";

/**
 * Mix two hex colors; t=0 gives a, t=1 gives b.
 */
const mixHex = (a: string, b: string, t: number): string => {
    const parse = (hex: string) => {
        const n = parseInt(hex.replace("#", ""), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const ca = parse(a);
    const cb = parse(b);
    const mixed = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
    return "#" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("");
};

/**
 * Draw the icon at `size` pixels into a 2D context.
 */
export const drawDuckeyIcon = (ctx: Ctx2D, size: number, accent: string): void => {
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.scale(size / 128, size / 128);

    // Rounded-square background, lighter at the top like the static icon
    const bg = ctx.createLinearGradient(0, 0, 0, 128);
    bg.addColorStop(0, mixHex(accent, "#FFFFFF", 0.06));
    bg.addColorStop(1, mixHex(accent, "#000000", 0.33));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, 128, 128, 28);
    ctx.fill();

    // Bill, drawn first so the head overlaps its base
    ctx.fillStyle = "#F7A325";
    ctx.fill(new Path2D(BILL));
    ctx.strokeStyle = "#D9861A";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(10, 64);
    ctx.lineTo(30, 64);
    ctx.stroke();

    // Key blade and the duck head that forms the key's bow
    ctx.fillStyle = CREAM;
    ctx.fill(new Path2D(KEY_BLADE));
    ctx.beginPath();
    ctx.arc(48, 63, 27, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = mixHex(accent, "#000000", 0.33);
    ctx.beginPath();
    ctx.arc(50, 55, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
};

/**
 * Render the icon to a data URL (for <img> in content scripts).
 */
export const renderDuckeyIconDataUrl = (accent: string, size: number): string => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    drawDuckeyIcon(canvas.getContext("2d")!, size, accent);
    return canvas.toDataURL("image/png");
};

/**
 * Set the toolbar icon to match the accent color. The default accent uses the
 * packaged PNGs; any other color is drawn on an OffscreenCanvas.
 */
export const updateToolbarIcon = async (accent: string): Promise<void> => {
    // MV3 exposes `action`, Firefox MV2 exposes `browserAction`
    const action = (browser.action ?? browser.browserAction) as typeof browser.action | undefined;
    if (!action) return;

    if (accent.toLowerCase() === ACCENT_COLORS.duckey.toLowerCase()) {
        await action.setIcon({
            path: {
                16: "/assets/icons/icon16.png",
                32: "/assets/icons/icon32.png",
            },
        });
        return;
    }

    const imageData: Record<string, ImageData> = {};
    for (const size of [16, 32]) {
        const canvas = new OffscreenCanvas(size, size);
        const ctx = canvas.getContext("2d")!;
        drawDuckeyIcon(ctx, size, accent);
        imageData[size] = ctx.getImageData(0, 0, size, size);
    }
    await action.setIcon({ imageData: imageData as Parameters<typeof action.setIcon>[0]["imageData"] });
};
