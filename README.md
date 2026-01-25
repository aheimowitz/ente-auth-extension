# Ente Auth Browser Extension

A browser extension for Ente Auth that provides secure 2FA code autofill.

> **Disclaimer**: This is an unofficial, community-developed browser extension. It is **not** developed, maintained, or officially supported by the Ente team. However, the Ente team has been made aware of this extension, and I am happy to collaborate with them when the time is right. Use at your own discretion.

## Features

- View and copy your 2FA codes from the browser toolbar
- Automatic detection of MFA input fields on websites
- Smart domain matching to suggest relevant codes
- One-click autofill with optional auto-submit
- Syncs with your Ente Auth account
- Works with Chrome and Firefox

## Installation

### From Release (Recommended)

1. Download the latest release for your browser from the [Releases page](../../releases):
   - **Chrome**: `ente-auth-chrome-x.x.x.zip`
   - **Firefox**: `ente-auth-firefox-x.x.x.zip`
2. Extract the zip file
3. Load the extension:

   **Chrome:**
   1. Open `chrome://extensions`
   2. Enable "Developer mode" (toggle in top right)
   3. Click "Load unpacked"
   4. Select the extracted folder

   **Firefox:**
   1. Open `about:debugging#/runtime/this-firefox`
   2. Click "Load Temporary Add-on"
   3. Select the `manifest.json` file in the extracted folder

> **Note**: Firefox temporary add-ons are removed when you close the browser. For
> persistent installation, you can use
> [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/).

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
│   ├── options/       # Extension options page
│   ├── popup/         # Browser toolbar popup UI
│   └── shared/        # Shared utilities (crypto, OTP, API)
└── dist-*/            # Build outputs (gitignored)
```

## Authentication

The extension authenticates by opening `auth.ente.io` in a new tab. Once you
log in, your credentials are securely captured and stored in the extension.
Your 2FA codes are then synced and available from the toolbar popup.

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
