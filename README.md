# Ente Auth Browser Extension

A browser extension for Ente Auth that provides secure 2FA code autofill.

> **Disclaimer**: This is an unofficial, community-developed browser extension. It is **not** developed, maintained, or officially supported by the Ente team. However, the Ente team has been made aware of this extension, and I am happy to collaborate with them when the time is right. Use at your own discretion.

## Features

- **View and copy** your 2FA codes from the browser toolbar
- **Create new codes** manually or by scanning QR codes from the current page
- **Edit and delete** existing codes
- **Organize with tags** - create, rename, delete, and filter by tags
- **Pin codes** to keep your most-used codes at the top
- **Autofill** - automatic detection of MFA input fields on websites
- **Smart matching** - domain matching to suggest relevant codes
- **One-click fill** with optional auto-submit
- **Syncs** with your Ente Auth account
- **Passkey support** - authenticate with passkeys via Ente Accounts
- **Self-hosted support** - configure a custom server endpoint
- **Cross-browser** - works with Chrome and Firefox

## Installation

### From Release (Recommended)

1. Download the latest release for your browser from the [Releases page](../../releases):
   - **Chrome**: `ente-auth-chrome-x.x.x.zip`
   - **Firefox**: `ente-auth-firefox-x.x.x.xpi` (recommended) or `.zip`
2. Install the extension:

   **Chrome:**
   1. Extract the zip file
   2. Open `chrome://extensions`
   3. Enable "Developer mode" (toggle in top right)
   4. Click "Load unpacked"
   5. Select the extracted folder

   **Firefox:**
   1. Open the `.xpi` file in Firefox - it will prompt you to install
   2. Click "Add" to install the extension

   > The `.xpi` file is signed by Mozilla and installs permanently. If you use the `.zip` instead, you'll need to load it as a temporary add-on via `about:debugging`, and it will be removed when Firefox closes.

### From Source

1. Clone this repository
2. Install dependencies:
   ```sh
   npm install
   ```
3. Build the extension:
   ```sh
   # Build for both browsers (outputs to dist-chrome/ and dist-firefox/)
   npm run build

   # Build for a specific browser
   npm run build:chrome
   npm run build:firefox
   ```
4. Load the extension using the steps above, selecting the `dist-chrome` or `dist-firefox` directory

## Development

Start the development build with file watching:

```sh
npm run dev
# or
yarn dev

# Watch a specific browser
npm run dev:chrome
npm run dev:firefox
```

This will rebuild the extension automatically when you make changes.

## Directory Structure

```
ente-auth-extension/
├── assets/            # Extension icons
├── manifests/         # Browser-specific manifest files
├── src/
│   ├── background/    # Service worker (Chrome) / background script (Firefox)
│   ├── content/       # Content scripts for MFA detection and autofill
│   ├── login/         # Built-in login page (SRP, passkey, email OTT)
│   ├── options/       # Extension options page
│   ├── popup/         # Browser toolbar popup UI
│   └── shared/        # Shared utilities (crypto, OTP, API, SRP)
└── dist-*/            # Build outputs (gitignored)
```

## Authentication

The extension has a built-in login page that supports:

- **SRP (Secure Remote Password)** — your password is verified without ever being sent to the server
- **Email OTT** — one-time token sent to your email as a fallback
- **Passkeys** — redirects to Ente Accounts for WebAuthn verification, then polls for the result
- **TOTP two-factor** — standard authenticator app codes

For self-hosted Ente instances, you can configure a custom server endpoint on
the login page or in the extension options. Once authenticated, your 2FA codes
are synced and available from the toolbar popup.

## How Autofill Works

When you visit a website with an MFA input field:

1. The content script detects the field using common patterns
2. If matching codes are found, a popup appears offering to fill them
3. Clicking "Fill" inserts the code and optionally submits the form

The extension matches codes to websites using the issuer name and any domain
hints stored in your 2FA entries.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Contact

Have questions, feedback, or want to get involved? Reach out to **iPcGuy** on the [Ente Discord server](https://discord.gg/z2YVKkycX3).

## License

This project is based on work from the [Ente](https://github.com/ente-io/ente) codebase, which is licensed under AGPL-3.0.

## Acknowledgments

- [Ente](https://ente.io) for the excellent Ente Auth app and open source ecosystem
