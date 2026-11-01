# Publishing Duckey

How to get Duckey into the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO), and how releases work after that.

Each store accepts a version number only once, and the **first** upload to each store has to be done by hand in its dashboard. So 1.0.0 goes up manually, and CI publishes everything from 1.0.1 on.

All the images are in [`store-listing/`](store-listing/). Text you can paste is at the end of this file, under [Listing copy](#listing-copy).

## Status

| Store | Status (2026-10-24) | Listing |
| --- | --- | --- |
| Chrome Web Store | **1.0.0 published** | [Chrome listing](https://chromewebstore.google.com/detail/duckey/immpjinemfjjbjobnioeajlalbniicpl) |
| Microsoft Edge Add-ons | **1.0.0 published** | [Edge listing](https://microsoftedge.microsoft.com/addons/detail/duckey/ohccakbkllnfhpjlbjnbehnajdkopocl) |
| Firefox Add-ons | **1.0.0 published** (listed). 1.0.1 was signed unlisted for the GitHub release, so the next store version is 1.0.2 | [Firefox listing](https://addons.mozilla.org/firefox/addon/duckey/) |

Steps 0–4 below are done, and all three stores are live. What's left: get the Chrome and Edge CI keys (steps 2 and 3), then step 5. The Chrome item ID for `CWS_EXTENSION_ID` is `immpjinemfjjbjobnioeajlalbniicpl`.

---

## 0. Before you start

- [ ] **Reviewer account.** Create a separate free Ente account just for store reviewers, and add 3–4 dummy 2FA codes to it (for example from a TOTP test generator). Don't turn on 2FA or passkeys for it. Its login only ever goes in the stores' private "notes for reviewers" fields, never in this repo.
- [ ] **Optional: tell Ente.** A short note to Ente about the rename and the store listings is a good idea. If they ever want it under their own account, it's easier now than later.

## 1. Cut the 1.0.0 release (stores off)

1. Turn off store uploads for this release:
   ```bash
   gh variable set STORE_PUBLISH --body off
   ```
2. Commit the 1.0.0 changes, push to `master`, then tag:
   ```bash
   git tag v1.0.0
   git push origin master v1.0.0
   ```
3. Wait for the **Build and Release** workflow. The GitHub release for `v1.0.0` will have:
   - `duckey-chrome-1.0.0.zip`, for Chrome **and** Edge
   - `duckey-firefox-1.0.0.zip`
   - `duckey-source-1.0.0.zip`, which Mozilla reviewers need
4. Download those three zips. These are the files you upload below.

The privacy policy URL that every store asks for is
`https://github.com/aheimowitz/ente-auth-extension/blob/master/PRIVACY.md`
(it works once step 1 is pushed).

## 2. Chrome Web Store

Chrome blocks every extension, Claude in Chrome included, from reading or controlling Chrome Web Store pages, so the dashboard has to be filled in by hand.

**Account (one time)**
1. Make sure 2-step verification is on for the Google account you'll publish with.
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), accept the agreement and pay the one-time $5 fee.
3. In **Account**, set your publisher name (e.g. "Duckey"), and fill in the trader / non-trader declaration. Enter a contact email and **verify** it (click Verify, then the link in the email). Chrome won't publish anything until it's verified.

**First submission**
1. Click **New item** and upload `duckey-chrome-1.0.0.zip`.
2. **Store listing** tab:
   - Description: see [Detailed description](#detailed-description)
   - Category: **Make Chrome Yours → Privacy & Security** (or Productivity → Tools)
   - Language: English
   - Store icon: `assets/icons/icon128.png` (Chrome requires exactly 128×128; the 300×300 logo is rejected)
   - Screenshots: `store-listing/1-autofill.png` … `5-settings.png`
   - Small promo tile: `store-listing/promo-small-440x280.png`
   - Marquee (optional): `store-listing/promo-marquee-1400x560.png`
   - Homepage / support URL: the GitHub repo and its Issues page
3. **Privacy** tab:
   - Single purpose: see [Single purpose](#single-purpose)
   - One justification per permission: see [Permission justifications](#permission-justifications)
   - "Are you using remote code?" → **No**
   - Data usage: tick **Personally identifiable information** (email) and **Authentication information**. Leave the rest unticked. Website content is read on the device only and is never sent anywhere.
   - Tick all three certifications.
   - Privacy policy URL: the PRIVACY.md link above
4. **Test instructions** tab: the [Reviewer notes](#reviewer-notes) plus the reviewer account.
5. **Distribution**: Public, all regions. Then **Submit for review**.
6. Copy the **item ID** (the 32-letter ID in the item's URL). That's `CWS_EXTENSION_ID`.

Because Duckey needs access to all sites, Chrome shows a "Publishing will be delayed: Broad Host Permissions" warning and does an in-depth review: anywhere from a few days to a few weeks. That's expected. The content script has to run on every site to detect 2FA fields, so `activeTab` or a site list can't replace it.

**API keys for CI (can be done while in review)**
1. Run the helper. It walks you through creating a Google Cloud project, enabling the Chrome Web Store API, and making an OAuth client. At the end it prints the client ID, client secret and refresh token:
   ```bash
   npx chrome-webstore-upload-keys
   ```
2. In Google Cloud → **OAuth consent screen**, set the publishing status to **In production**. Refresh tokens from an app left in "Testing" stop working after 7 days.

## 3. Microsoft Edge Add-ons

**Account (one time, free)**
1. Sign up for the Microsoft Edge program in [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd) with a Microsoft account (account type: Individual).
2. A new account can take a few hours before the Edge dashboard opens. Until then, the Edge workspace tile just sends you back to Partner Center Home. If it still does that the next day, contact Partner Center support.

**First submission**
1. **Create new extension** and upload the **same** `duckey-chrome-1.0.0.zip`.
2. **Availability**: Public, all markets.
3. **Properties**:
   - Category: **Productivity**
   - Privacy policy: **Yes**, with the PRIVACY.md link
   - Website and support contact: the repo and its Issues page
4. **Privacy**: the same answers as Chrome's Privacy tab: [Single purpose](#single-purpose), the [Permission justifications](#permission-justifications), no remote code, Personally identifiable information and Authentication information, the PRIVACY.md URL, and the three certifications.
5. **Store listings** (English):
   - Description: see [Detailed description](#detailed-description). There's no separate short description field.
   - Extension logo: `store-listing/store-logo-300x300.png`
   - Small promo tile: `promo-small-440x280.png`
   - Large promo tile (optional): `promo-marquee-1400x560.png`
   - Screenshots: the five 1280×800 PNGs. Upload them one at a time, in order; uploading several at once scrambles the order, and they can't be dragged afterwards.
   - Search terms: `2FA`, `TOTP`, `authenticator`, `Ente Auth`, `two-factor`, `one-time code`, `autofill`
6. **Publish**. In "Notes for certification", paste the [Reviewer notes](#reviewer-notes) plus the reviewer account. Microsoft says review takes up to 7 business days.
7. On the extension's **Overview** page, copy the **Product ID**. That's `EDGE_PRODUCT_ID`.

**API keys for CI**
1. Partner Center → Microsoft Edge → **Publish API** → **Create API credentials**.
2. Copy the **Client ID** and **API key**. The key expires: Partner Center shows the date. Put a reminder in your calendar to renew it and update the `EDGE_API_KEY` secret.

## 4. Firefox Add-ons (AMO)

The add-on already exists on AMO as **unlisted**, under the ID `ente-auth-extension@adamheimowitz.com`. Keep that ID so existing users stay on the same add-on. The CI secrets `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` are already set.

1. In the [Developer Hub](https://addons.mozilla.org/developers/addons), open the add-on and click **Upload New Version**.
2. The upload page defaults to **On your own** (unlisted). Click **Change**, choose **On this site** (listed), then upload `duckey-firefox-1.0.0.zip`. Leave compatibility on Firefox only (not tested on Firefox for Android).
3. When it asks whether you need to submit source code, answer **Yes** and upload `duckey-source-1.0.0.zip`. In the reviewer notes, add the build steps: "Node 20, `npm ci`, `npm run build:firefox`; output in `dist-firefox/`."
4. Fill in the listing:
   - Name: `Duckey: 2FA Autofill for Ente Auth`. Renaming rewrites the add-on URL (slug); set it to `duckey`.
   - Summary: see [Short description](#short-description)
   - Description: see [Detailed description](#detailed-description)
   - Category: **Privacy & Security**
   - License: **GNU Affero General Public License v3.0**
   - Privacy policy: paste the text of PRIVACY.md
   - Support site / email: the repo's Issues page
5. Add the [Reviewer notes](#reviewer-notes) plus the reviewer account, and submit.
6. Then go to **Edit Product Page → Images**:
   - Upload a custom icon: `branding/duckey-512.png`. Mozilla's listing doesn't use the package icon and otherwise shows a generic puzzle piece.
   - Add the five screenshots one at a time, in order, with captions.

## 5. Turn on CI publishing (after all three are live)

```bash
gh secret set CWS_EXTENSION_ID
gh secret set CWS_CLIENT_ID
gh secret set CWS_CLIENT_SECRET
gh secret set CWS_REFRESH_TOKEN
gh secret set EDGE_PRODUCT_ID
gh secret set EDGE_CLIENT_ID
gh secret set EDGE_API_KEY
gh variable set AMO_CHANNEL --body listed
gh variable set STORE_PUBLISH --body on
```

Each `gh secret set` asks you to paste the value.

## 6. Every release after that

1. Bump `version` in `package.json`, `manifests/chrome.manifest.json` and `manifests/firefox.manifest.json`. The workflow fails if the tag and the manifests don't match.
2. If the release adds a permission, add its justification to the [Permission justifications](#permission-justifications) table. The Chrome Web Store only shows a justification box for permissions in an uploaded package, so paste it into the Privacy tab (and Edge Partner Center, if it asks) **right after CI uploads** the new version.
3. Commit, then `git tag vX.Y.Z && git push origin master vX.Y.Z`.
4. CI builds and uploads to all three stores and creates the GitHub release. Each store still reviews every update.
5. The release text CI generates is just the commit message bodies. Edit the GitHub release and replace it with hand-written notes.

If a release needs to skip the stores, set `STORE_PUBLISH` to `off` first, and set it back to `on` afterwards.

## 7. After launch

- Update the README's install section to point to the three store pages. Tell people who loaded it unpacked to remove that copy and install from the store.
- **Knock-offs:** the code is AGPL-3.0 and you hold the copyright. A copy that doesn't publish its source, or doesn't keep the license, can be reported to each store as a copyright violation. Chrome and Edge each have a report form for items, and AMO has "Report this add-on". Link your listing as the original.

---

## Listing copy

### Name
Duckey: 2FA Autofill for Ente Auth

### Short description
Fill 2FA codes from your Ente Auth vault in one click.

### Detailed description

```
Duckey puts your Ente Auth 2FA codes in your browser, and fills them in for you.

When a site asks for a verification code, Duckey finds the field, suggests the right code for that site, and fills it with one click. Your whole vault is also in the toolbar, so you can copy any code.

FEATURES
• One-click autofill on 2FA code fields, including split "one box per digit" inputs
• Smart matching suggests the right code for the site you're on
• Browse, search, copy, add, edit and delete codes
• Add codes by scanning a QR code on the current page
• Tags and pins to organize your codes
• Vault timeout, lock on idle, and PIN unlock
• Light and dark themes, with Duckey green, Ente purple or your own accent color
• Works with Ente Cloud and self-hosted Ente servers
• Passkey sign-in supported

PRIVACY
Your codes stay end-to-end encrypted and are decrypted only on your device. Duckey has no analytics or tracking, and the only server it talks to is the Ente server you sign in to.

Open source (AGPL-3.0): https://github.com/aheimowitz/ente-auth-extension

Duckey is an unofficial, community-built extension. It is not made by, affiliated with, or endorsed by Ente Technologies, Inc. You need an Ente Auth account to use it.
```

### Single purpose
Duckey shows and autofills two-factor authentication (TOTP) codes from the user's Ente Auth account.

### Permission justifications

| Permission | Justification |
| --- | --- |
| Host permission (`<all_urls>`) | Duckey detects 2FA code fields and fills codes on whatever site the user is signing in to, so its content script must run on all sites. It also needs to reach the user's Ente server, which can be self-hosted at any address. Page content is processed on the device only and never sent anywhere. |
| `activeTab` | Reads the current tab's address to suggest the matching code, and captures the visible tab when the user clicks "Scan QR code" to add a code. |
| `storage` | Stores the user's session, encrypted key material, settings and an encrypted code cache. |
| `alarms` | Syncs the user's codes from their Ente account on a schedule. |
| `idle` | Locks the vault when the computer is idle, if the user turns on that setting. |
| `contextMenus` | Adds a "Fill code with Duckey" item to the right-click menu on text fields. Choosing it opens Duckey's code picker on that field, so users can fill a code when automatic detection misses the field. |

### Reviewer notes

```
Duckey needs an Ente Auth account. A test account is below.

1. Click the Duckey toolbar icon, then "Log in". A login tab opens. Sign in with the test account.
2. The popup now lists the test account's 2FA codes. Click a code to copy it.
3. To see autofill, open any page with a one-time-code field. The Duckey icon appears in the field; click it to pick and fill a code.

Test account (Ente Cloud):
Email: <reviewer account email>
Password: <reviewer account password>

The extension is open source: https://github.com/aheimowitz/ente-auth-extension
```
