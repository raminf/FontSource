# FontSource - Browser Extension

![FontSource popup and scan results](media/FontSource-ss-3.png)

A browser extension that analyzes websites to identify fonts, their sources, and license information.

## Features

- Detects fonts used on any website
- Identifies font sources (Google Fonts, Adobe Typekit, self-hosted, etc.)
- Shows license information for each font
- Configurable scanning options (root vs current page)
- Clean, modern UI with detailed font information

## Supported Browsers

- Chrome
- Firefox
- Safari

## Quick Start

```bash
# Install dependencies
make install

# Build the extension
make build         # All browsers
make build-chrome  # Chrome
make build-firefox # Firefox
make build-safari  # Safari

# Load in browser
make load-chrome    # Chrome
make load-firefox   # Firefox
make load-safari    # Safari

# Run tests
make test

# Package for distribution
make package-chrome
make package-firefox
make package-safari
```

## Makefile Commands

### Installation & Build
| Command | Description |
|---------|-------------|
| `make install` | Install npm dependencies |
| `make build` | Build all browser targets under `artifacts/` |
| `make build-chrome` | Build for Chrome (`manifest.json` in `artifacts/chrome/`) |
| `make build-firefox` | Build for Firefox (MV2 manifest in `artifacts/firefox/`; required for temporary add-on) |
| `make build-safari` | Build for Safari (`manifest.json` in `artifacts/safari/`) |
| `make clean` | Remove `artifacts/` (unpacked extension and store zips); keeps `node_modules` |

### Development
| Command | Description |
|---------|-------------|
| `make lint` | Lint JavaScript code |
| `make format` | Format code with Prettier |
| `make watch` | Watch for file changes |

### Loading in Browser
| Command | Description |
|---------|-------------|
| `make load-chrome` | Load extension in Chrome (development) |
| `make load-firefox` | Load extension in Firefox (development) |
| `make load-safari` | Load extension in Safari (development) |
| `make load` | Load extension (auto-detects browser) |

### Uninstalling from Browser
| Command | Description |
|---------|-------------|
| `make uninstall-chrome` | Uninstall from Chrome |
| `make uninstall-firefox` | Uninstall from Firefox |
| `make uninstall-safari` | Uninstall from Safari |
| `make uninstall` | Uninstall (auto-detects browser) |

### Packaging
| Command | Description |
|---------|-------------|
| `make package-chrome` | Create Chrome Web Store package |
| `make package-firefox` | Create Firefox Add-ons package |
| `make package-safari` | Create Safari App Store package |
| `make package` | Create packages for all platforms |

### Deployment
| Command | Description |
|---------|-------------|
| `make deploy-chrome` | Deploy to Chrome Web Store |
| `make deploy-firefox` | Deploy to Firefox Add-ons |
| `make deploy-safari` | Deploy to Safari App Store |
| `make deploy` | Deploy to all stores |

### Help
| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make` | Show help (default target) |

## Project Structure

```
FontSource/
├── artifacts/                 # make build / package-* output (gitignored)
│   ├── chrome/                # unpacked Chrome extension
│   ├── firefox/               # unpacked Firefox extension
│   ├── safari/                # unpacked Safari extension
│   └── fontsource-*.zip       # Chrome / Firefox packages after make package-*
├── src/
│   ├── background.js          # Background service worker
│   ├── content.js             # Content script for font detection
│   ├── popup/                 # Popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── settings/              # Settings panel
│   │   ├── settings.html
│   │   ├── settings.css
│   │   └── settings.js
│   └── lib/                   # Utility libraries
│       └── font-detection.js
├── manifest.json              # Chrome manifest
├── manifest.firefox.json      # Firefox manifest
├── manifest.safari.json       # Safari manifest
├── package.json               # npm package config
├── Makefile                   # Build and deployment commands
├── .gitignore
├── .eslintrc.json
└── .prettierrc.json
```

## Development

```bash
# Watch mode for development
make watch

# Lint code
make lint

# Format code
make format
```

## License

MIT License
