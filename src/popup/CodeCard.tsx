/**
 * Individual code display card component.
 * Matches the Ente Auth desktop app design.
 */
import React, { useState, useEffect, useRef } from "react";
import { prettyFormatCode } from "@shared/code";
import { getProgress, generateOTPs } from "@shared/otp";
import type { Code } from "@shared/types";

interface CodeCardProps {
    code: Code;
    timeOffset: number;
    otp: string;
    nextOtp: string;
    onEdit?: (code: Code) => void;
    onPin?: (code: Code) => void;
}

export const CodeCard: React.FC<CodeCardProps> = ({
    code,
    timeOffset,
    otp,
    nextOtp,
    onEdit,
    onPin,
}) => {
    const [copied, setCopied] = useState(false);
    const progressBarRef = useRef<HTMLDivElement>(null);

    // Local OTP state that updates at period boundaries (synced with progress bar)
    const [displayOtp, setDisplayOtp] = useState(otp);
    const [displayNextOtp, setDisplayNextOtp] = useState(nextOtp);

    // Use CSS animation for smooth progress bar (runs on compositor thread, unaffected by JS)
    const period = code.period;
    const [isWarning, setIsWarning] = useState(() => getProgress(code, timeOffset) < 0.4);

    useEffect(() => {
        const progressBar = progressBarRef.current;
        if (!progressBar) return;

        let intervalId: number | undefined;
        let warningIntervalId: number | undefined;

        const updateAnimation = () => {
            const periodMs = period * 1000;
            const timestamp = Date.now() + timeOffset;
            const timeRemaining = periodMs - (timestamp % periodMs);
            const currentProgress = timeRemaining / periodMs;

            // Update warning state immediately when resetting
            setIsWarning(currentProgress < 0.4);

            // Update OTPs at period boundary (when progress resets to ~100%)
            if (currentProgress > 0.95) {
                const [newOtp, newNextOtp] = generateOTPs(code, timeOffset);
                setDisplayOtp(newOtp);
                setDisplayNextOtp(newNextOtp);
            }

            // Set current width and animate to 0
            progressBar.style.transition = 'none';
            progressBar.style.width = `${currentProgress * 100}%`;

            // Force reflow to apply the width immediately
            progressBar.offsetHeight;

            // Animate from current position to 0 over remaining time
            progressBar.style.transition = `width ${timeRemaining}ms linear`;
            progressBar.style.width = '0%';
        };

        const checkWarning = () => {
            setIsWarning(getProgress(code, timeOffset) < 0.4);
        };

        updateAnimation();

        // Check warning color every second
        warningIntervalId = window.setInterval(checkWarning, 1000);

        // Recalculate animation at each period boundary
        const periodMs = period * 1000;
        const timestamp = Date.now() + timeOffset;
        const timeToNextPeriod = periodMs - (timestamp % periodMs);

        const timeoutId = window.setTimeout(() => {
            updateAnimation();
            // Then set up interval for subsequent periods
            intervalId = window.setInterval(updateAnimation, periodMs);
        }, timeToNextPeriod);

        return () => {
            window.clearTimeout(timeoutId);
            if (intervalId) window.clearInterval(intervalId);
            if (warningIntervalId) window.clearInterval(warningIntervalId);
        };
    }, [period, timeOffset, code]);

    // Sync with parent props when they change (e.g., initial load or code change)
    useEffect(() => {
        setDisplayOtp(otp);
        setDisplayNextOtp(nextOtp);
    }, [otp, nextOtp]);

    const handleCardClick = async () => {
        try {
            await navigator.clipboard.writeText(displayOtp);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (error) {
            console.error("Failed to copy:", error);
        }
    };

    return (
        <div
            className={`code-card ${copied ? "copied" : ""}`}
            onClick={handleCardClick}
        >
            {/* Progress bar at top */}
            <div
                ref={progressBarRef}
                className={`code-progress-bar ${isWarning ? "warning" : ""}`}
            />

            {/* Pin indicator - subtle corner triangle */}
            {code.codeDisplay?.pinned && (
                <div className="pin-indicator">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
                    </svg>
                </div>
            )}

            {/* Card content */}
            <div className="code-content">
                <div className="code-left">
                    <div className="code-issuer">{code.issuer}</div>
                    <div className="code-account">{code.account || ""}</div>
                    <div className="code-otp">{prettyFormatCode(displayOtp)}</div>
                </div>
                <div className="code-right">
                    <div className="code-next-label">next</div>
                    <div className="code-next-otp">{prettyFormatCode(displayNextOtp)}</div>
                </div>
            </div>

            {/* Action buttons (visible on hover) */}
            {(onEdit || onPin) && (
                <div className="code-actions">
                    {onPin && (
                        <button
                            className={`code-action-button ${code.codeDisplay?.pinned ? "active" : ""}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onPin(code);
                            }}
                            title={code.codeDisplay?.pinned ? "Unpin" : "Pin"}
                        >
                            <PinIcon />
                        </button>
                    )}
                    {onEdit && (
                        <button
                            className="code-action-button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(code);
                            }}
                            title="Edit"
                        >
                            <EditIcon />
                        </button>
                    )}
                </div>
            )}

            {/* Copied toast pill */}
            {copied && <div className="copied-pill">Copied</div>}
        </div>
    );
};

// Pin icon
const PinIcon: React.FC = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
    >
        <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
    </svg>
);

// Edit icon (pencil)
const EditIcon: React.FC = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);
