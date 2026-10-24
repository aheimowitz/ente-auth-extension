# Privacy Policy

_Last updated: 2026-10-24_

This policy covers Duckey ("the extension") for Chrome, Edge and Firefox. The extension is an unofficial, community-developed client for [Ente Auth](https://ente.io/auth). It is not run by Ente Technologies, Inc.

## Summary

- The extension does **not** collect analytics or telemetry, and it does not track you.
- The extension does **not** sell or share your data with anyone.
- The only server the extension talks to is the Ente server you sign in to. By default that is `api.ente.io`. For passkey sign-in, it opens the Ente Accounts site your server specifies (`accounts.ente.com`, or `accounts.ente.io` for older passkeys). If you set a self-hosted server, it talks to that one instead.
- Your 2FA secrets are end-to-end encrypted. They are decrypted only on your device.

## Data the extension handles

| Data | Why | Where it goes |
| --- | --- | --- |
| Email address | To sign in to your Ente account | Sent to your Ente server; stored in the browser's extension storage |
| Password | To derive your keys and sign in using SRP | Never stored or sent. Only a derived verifier proof goes to the server |
| Authentication token | To keep you signed in | Sent to your Ente server; stored in extension storage |
| Encryption keys and key attributes | To decrypt your vault | Stored only in extension storage. See "Local storage" below |
| 2FA codes and secrets | To show and fill codes | Downloaded encrypted from your Ente server, decrypted on your device, and cached in session storage |
| Codes you create or edit | To sync your vault | Encrypted on your device before upload to your Ente server |
| Settings and custom domain mappings | To configure the extension | Stored only in extension storage |
| Web page content (current tab) | To find 2FA input fields and suggest the right code for the site | Read in the page only; never sent anywhere |
| Screenshot of the visible tab | Only when you click "Scan QR code", to read the QR code | Processed in the browser and then discarded; never sent anywhere |

## Local storage

The extension uses the browser's extension storage (`storage.local` and `storage.session`):

- If the vault timeout is anything other than "never", the decrypted master key is kept only in session storage, and is cleared on lock or when the browser restarts.
- If you set the vault timeout to "never", the master key stays in local extension storage so the vault stays unlocked across restarts. Anyone with access to your browser profile could read it then.
- If you set a PIN, the master key is stored encrypted with a key derived from that PIN.

Logging out clears all of the extension's stored data.

## Permissions

- **Access to all websites (`<all_urls>`)**: To detect 2FA fields and fill codes on any site you sign in to, and to reach self-hosted Ente servers at any address.
- **activeTab**: To read the current tab's address for code suggestions, and to capture it for QR scanning.
- **storage**: To store the data described above.
- **alarms**: To sync your vault on a schedule.
- **idle**: To lock the vault when your computer is idle, if you choose that setting.

## Third parties

The extension does not include any third-party analytics, advertising or tracking code. Your use of the Ente service is covered by [Ente's privacy policy](https://ente.io/privacy).

## Changes

Changes to this policy are published in this file in the [project repository](https://github.com/aheimowitz/ente-auth-extension/blob/master/PRIVACY.md).

## Contact

Open an issue at https://github.com/aheimowitz/ente-auth-extension/issues.
