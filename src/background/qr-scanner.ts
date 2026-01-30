/**
 * QR code scanning from the current page.
 * Uses chrome.tabs.captureVisibleTab() to capture a screenshot
 * and jsQR to decode QR codes.
 */
import jsQR from "jsqr";
import { browser } from "@shared/browser";
import { codeFromURIString } from "@shared/code";
import type { ParsedQRCode } from "@shared/types";

/**
 * Scan the current visible tab for QR codes.
 * Returns the parsed OTP data if a valid otpauth:// QR code is found.
 */
export const scanQRFromPage = async (): Promise<{
    success: boolean;
    data?: ParsedQRCode;
    error?: string;
}> => {
    try {
        // Capture the visible tab as a PNG data URL
        const dataUrl = await browser.tabs.captureVisibleTab(undefined, {
            format: "png",
        });

        // Convert data URL to image data
        const imageData = await dataUrlToImageData(dataUrl);

        // Scan for QR codes using jsQR
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

        if (!qrCode) {
            return {
                success: false,
                error: "No QR code found on the page. Make sure the QR code is fully visible.",
            };
        }

        const uri = qrCode.data;

        // Check if it's an otpauth:// URI
        if (!uri.startsWith("otpauth://")) {
            return {
                success: false,
                error: "QR code found but it's not an authenticator code. Expected otpauth:// URI.",
            };
        }

        // Parse the URI to extract the code data
        try {
            const code = codeFromURIString("temp", uri);

            const parsedData: ParsedQRCode = {
                uri,
                issuer: code.issuer,
                account: code.account,
                secret: code.secret,
                type: code.type,
                algorithm: code.algorithm,
                digits: code.length,
                period: code.period,
                counter: code.counter,
            };

            return {
                success: true,
                data: parsedData,
            };
        } catch (parseError) {
            return {
                success: false,
                error: `Failed to parse QR code: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
            };
        }
    } catch (error) {
        // Handle permission errors
        if (error instanceof Error) {
            if (error.message.includes("Cannot access")) {
                return {
                    success: false,
                    error: "Cannot capture this page. Try a different tab.",
                };
            }
            if (error.message.includes("permission")) {
                return {
                    success: false,
                    error: "Permission denied. The extension needs access to capture the screen.",
                };
            }
        }

        return {
            success: false,
            error: `Failed to scan QR code: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
    }
};

/**
 * Convert a data URL to ImageData for jsQR processing.
 * Uses createImageBitmap() which works in service worker contexts
 * (unlike Image which requires DOM).
 */
const dataUrlToImageData = async (dataUrl: string): Promise<ImageData> => {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create ImageBitmap from blob (works in service workers)
    const bitmap = await createImageBitmap(blob);

    // Create an offscreen canvas and draw the bitmap
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("Failed to get canvas context");
    }

    // Draw the bitmap and extract pixel data
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    // Clean up
    bitmap.close();

    return imageData;
};
