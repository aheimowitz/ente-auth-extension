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
}

export const CodeCard: React.FC<CodeCardProps> = ({
    code,
    timeOffset,
    otp,
    nextOtp,
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

            {/* Pin indicator */}
            {code.codeDisplay?.pinned && (
                <>
                    <div className="pin-ribbon" />
                    <span className="pin-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
                        </svg>
                    </span>
                </>
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

            {/* Copied toast pill */}
            {copied && <div className="copied-pill">Copied</div>}
        </div>
    );
};
