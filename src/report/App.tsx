/**
 * Report a problem: shows what Duckey collected about a page or field, lets
 * the user describe the problem and edit the report, then opens a prefilled
 * GitHub issue in their own browser. Duckey never submits anything itself.
 */
import React, { useEffect, useMemo, useState } from "react";
import { sendMessage } from "@shared/browser";
import { useTheme } from "@shared/useTheme";
import { NEW_ISSUE_URL } from "@shared/links";
import type { ProblemReport } from "@shared/types";
import { formatBody, formatTitle } from "./format";

// GitHub rejects very long prefill URLs; past this, the body goes to the
// clipboard and the user pastes it instead
const MAX_URL_LENGTH = 7500;

export const App: React.FC = () => {
    useTheme();

    const [report, setReport] = useState<ProblemReport | null | undefined>(undefined);
    const [description, setDescription] = useState("");
    const [includeFullUrl, setIncludeFullUrl] = useState(false);
    const [editedBody, setEditedBody] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(() => {
        sendMessage<{ success: boolean; data?: ProblemReport }>({ type: "GET_PROBLEM_REPORT" })
            .then((res) => setReport(res.success && res.data ? res.data : null))
            .catch(() => setReport(null));
    }, []);

    const generatedBody = useMemo(
        () => (report ? formatBody(report, description, includeFullUrl) : ""),
        [report, description, includeFullUrl]
    );
    const body = editedBody ?? generatedBody;
    const title = report ? formatTitle(report) : "";

    const copy = async (text: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    };

    const openIssue = async () => {
        const params = new URLSearchParams({ title, body });
        let url = `${NEW_ISSUE_URL}?${params}`;
        if (url.length > MAX_URL_LENGTH) {
            const copied = await copy(body);
            url = `${NEW_ISSUE_URL}?${new URLSearchParams({
                title,
                body: "<!-- Paste the report Duckey copied to your clipboard here -->\n",
            })}`;
            setStatus(
                copied
                    ? "The report is too long for a link, so it's on your clipboard. Paste it into the issue."
                    : "The report is too long for a link. Copy it from the box below and paste it into the issue."
            );
        }
        window.open(url, "_blank", "noopener");
    };

    if (report === undefined) {
        return <div className="welcome-page" />;
    }

    if (report === null) {
        return (
            <div className="welcome-page">
                <TopBar />
                <main className="welcome-card">
                    <div className="welcome-step-icon" aria-hidden="true">
                        <FlagIcon />
                    </div>
                    <h1>Nothing to report yet</h1>
                    <p className="welcome-lead">To report a problem on a site:</p>
                    <ul className="welcome-points">
                        <li>
                            Right-click the code field and choose <strong>Report a problem with this field</strong>
                        </li>
                        <li>
                            Or right-click the Duckey icon in your toolbar and choose{" "}
                            <strong>Report a problem on this page</strong>
                        </li>
                    </ul>
                </main>
            </div>
        );
    }

    return (
        <div className="welcome-page report-page">
            <TopBar />

            <main className="welcome-card">
                <div className="welcome-step-icon" aria-hidden="true">
                    <FlagIcon />
                </div>
                <p className="welcome-eyebrow">Report a problem</p>
                <h1>{title}</h1>
                <p className="welcome-lead">
                    Duckey gathered the details below about the page. Add what went wrong, check the report, then open
                    an issue on GitHub. Nothing is sent until you submit it there.
                </p>

                <label className="report-label" htmlFor="report-description">
                    What went wrong?
                </label>
                <textarea
                    id="report-description"
                    className="form-input report-textarea"
                    rows={3}
                    placeholder="e.g. The icon doesn't appear on the 6-digit code field after logging in"
                    value={description}
                    onChange={(e) => {
                        setDescription(e.target.value);
                        setEditedBody(null);
                    }}
                />

                <label className="welcome-check report-check">
                    <input
                        type="checkbox"
                        checked={includeFullUrl}
                        onChange={(e) => {
                            setIncludeFullUrl(e.target.checked);
                            setEditedBody(null);
                        }}
                    />
                    <span>Include the full page address (it can contain account details or tokens)</span>
                </label>

                <div className="report-preview-header">
                    <label className="report-label" htmlFor="report-body">
                        Report
                    </label>
                    {editedBody !== null && (
                        <button className="welcome-text-button" onClick={() => setEditedBody(null)}>
                            Reset edits
                        </button>
                    )}
                </div>
                <textarea
                    id="report-body"
                    className="form-input report-body"
                    rows={14}
                    spellCheck={false}
                    value={body}
                    onChange={(e) => setEditedBody(e.target.value)}
                />
                <p className="welcome-fine">
                    Never included: what you typed into fields, your codes or their names, cookies, or the page's
                    content. You can edit anything above.
                </p>

                {status && <p className="report-status">{status}</p>}

                <footer className="welcome-nav">
                    <button
                        className="welcome-text-button"
                        onClick={async () => setStatus((await copy(body)) ? "Report copied." : "Couldn't copy.")}
                    >
                        Copy report
                    </button>
                    <button className="welcome-button" onClick={openIssue}>
                        Open GitHub issue
                    </button>
                </footer>
            </main>
        </div>
    );
};

const TopBar: React.FC = () => (
    <header className="welcome-topbar">
        <div className="welcome-brand">
            <Logo />
            <span>Duckey</span>
        </div>
    </header>
);

function FlagIcon(): React.ReactElement {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </svg>
    );
}

function Logo(): React.ReactElement {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect width="24" height="24" rx="5.25" style={{ fill: "var(--accent)" }} />
            <path d="M6.75 10.5C4.13 9.94 1.69 10.5 1.69 12C1.69 13.5 4.13 14.06 6.75 13.5Z" fill="#F7A325" />
            <path d="M11.25 10.31H21A.75.75 0 0 1 21.75 11.06V12.56A.75.75 0 0 1 21 13.31H20.25V15.75A.56.56 0 0 1 19.69 16.31H18.56A.56.56 0 0 1 18 15.75V13.31H16.88V14.81A.56.56 0 0 1 16.31 15.38H15.19A.56.56 0 0 1 14.63 14.81V13.31H11.25Z" fill="#FFF6E0" />
            <circle cx="9" cy="11.81" r="5.06" fill="#FFF6E0" />
            <circle cx="9.38" cy="10.31" r="0.94" fill="#0A5048" />
        </svg>
    );
}
