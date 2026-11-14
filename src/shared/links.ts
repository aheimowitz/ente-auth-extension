/**
 * External links shared by the extension pages.
 */
import { isFirefox } from "./browser";

export const REPO_URL = "https://github.com/aheimowitz/ente-auth-extension";
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;

/**
 * Store page where the user can leave a review, for the browser they're using.
 * Edge has no separate reviews page; ratings are on the listing itself.
 */
export const getReviewUrl = (): string => {
    if (isFirefox()) return "https://addons.mozilla.org/firefox/addon/duckey/reviews/";
    if (navigator.userAgent.includes("Edg/")) {
        return "https://microsoftedge.microsoft.com/addons/detail/duckey/ohccakbkllnfhpjlbjnbehnajdkopocl";
    }
    return "https://chromewebstore.google.com/detail/duckey/immpjinemfjjbjobnioeajlalbniicpl/reviews";
};
