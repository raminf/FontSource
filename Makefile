# FontSource Makefile — build, package, and load the browser extension

SHELL := /bin/bash
.DEFAULT_GOAL := help

VERSION := 1.0.2
BUILD_DIR := dist
SRC_DIR := src

BLUE := \033[34m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

.PHONY: all install build clean clean-dist distclean test lint format icons bump \
	test-panel-baseline-record test-panel-baseline-check \
	package package-chrome package-firefox package-safari bundle \
	load load-chrome load-firefox load-safari \
	uninstall uninstall-chrome uninstall-firefox uninstall-safari \
	deploy deploy-chrome deploy-firefox deploy-safari watch help

all: help ## Show help (default goal)

install: ## Install npm dependencies
	@printf "$(BLUE)Installing dependencies...$(RESET)\n"
	npm install
	@printf "$(GREEN)Dependencies installed.$(RESET)\n"

clean: clean-dist ## Remove dist/ (default clean; keeps node_modules)
	@printf "$(GREEN)Clean complete ($(BUILD_DIR) removed).$(RESET)\n"

clean-dist: ## Remove build output directory only
	@printf "$(BLUE)Removing $(BUILD_DIR)...$(RESET)\n"
	rm -rf $(BUILD_DIR)

distclean: clean-dist ## Remove dist/ and node_modules
	@printf "$(BLUE)Removing node_modules...$(RESET)\n"
	rm -rf node_modules
	@printf "$(GREEN)distclean complete.$(RESET)\n"

build: clean-dist ## Copy src to dist/ (Chrome MV3 manifest in dist/)
	@printf "$(BLUE)Building extension...$(RESET)\n"
	@test -f $(SRC_DIR)/icons/icon48.png && test -f $(SRC_DIR)/icons/icon128.png || { printf "$(YELLOW)Missing PNG icons under $(SRC_DIR)/icons/. Run $(GREEN)make icons$(YELLOW) (needs rsvg-convert), or restore tracked files from git.$(RESET)\n"; exit 1; }
	mkdir -p $(BUILD_DIR)
	cp -R $(SRC_DIR)/. $(BUILD_DIR)/
	rm -f $(BUILD_DIR)/manifest.firefox.json $(BUILD_DIR)/manifest.safari.json
	@printf "$(GREEN)Build complete.$(RESET)\n"
	@printf "$(YELLOW)Load unpacked in Chrome/Safari from: $(BUILD_DIR)/$(RESET)\n"

test: ## Run automated tests (Vitest)
	@printf "$(BLUE)Running tests...$(RESET)\n"
	npm test
	@printf "$(GREEN)Tests finished.$(RESET)\n"

lint: ## Lint JavaScript
	@printf "$(BLUE)Linting...$(RESET)\n"
	npm run lint
	@printf "$(GREEN)Lint complete.$(RESET)\n"

format: ## Format with Prettier
	@printf "$(BLUE)Formatting...$(RESET)\n"
	npm run format
	@printf "$(GREEN)Format complete.$(RESET)\n"

bump: ## Bump release version: Makefile VERSION, manifests, package.json/lock, Xcode MARKETING_VERSION + build (BUMP=patch|minor|major)
	@printf "$(BLUE)Bumping version ($(YELLOW)BUMP=$(or $(BUMP),patch)$(BLUE))...$(RESET)\n"
	@bash scripts/bump-version.sh "$(or $(BUMP),patch)"
	@printf "$(GREEN)Bump complete.$(RESET)\n"

test-panel-baseline-record: ## Record panel listing baseline (needs make build + Playwright chromium). Optional: PANEL_ARGS='--slug=fixture --url=https://…'
	@printf "$(BLUE)Recording panel baseline ($(YELLOW)dist/$(BLUE) extension, Playwright)...$(RESET)\n"
	node tests/panel-baseline-runner.mjs record $(PANEL_ARGS)
	@printf "$(GREEN)Baseline written under tests/baselines/$(RESET)\n"

test-panel-baseline-check: ## Diff current scan vs tests/baselines/<slug>.txt (same args as record)
	@printf "$(BLUE)Checking panel baseline...$(RESET)\n"
	node tests/panel-baseline-runner.mjs check $(PANEL_ARGS)
	@printf "$(GREEN)Panel baseline matches.$(RESET)\n"

ICON_SRC := media/icon1024.svg
ICON_LIGHT_SRC := media/icon1024-light.svg

# Safari: Xcode wrapper produced by xcrun safari-web-extension-packager (see package-safari).
SAFARI_XCODE_DIR := safari/FontSource
# --rebuild-project must be the .xcodeproj bundle, not the parent folder (Xcode 16+:
# "Files of type 'Folder' cannot be opened outside of a workspace.").
SAFARI_XCODEPROJ := $(SAFARI_XCODE_DIR)/FontSource.xcodeproj

icons: ## Regenerate src/icons PNGs from $(ICON_SRC) and $(ICON_LIGHT_SRC) (needs rsvg-convert)
	@command -v rsvg-convert >/dev/null 2>&1 || { printf "$(YELLOW)rsvg-convert not found. Install with: brew install librsvg$(RESET)\n"; exit 1; }
	@test -f $(ICON_SRC) || { printf "$(YELLOW)Missing $(ICON_SRC)$(RESET)\n"; exit 1; }
	@test -f $(ICON_LIGHT_SRC) || { printf "$(YELLOW)Missing $(ICON_LIGHT_SRC) (white twin of $(ICON_SRC) for dark toolbar)$(RESET)\n"; exit 1; }
	mkdir -p $(SRC_DIR)/icons
	for s in 16 24 32 48 128; do \
		rsvg-convert -w $$s -h $$s $(ICON_SRC) -o $(SRC_DIR)/icons/icon$$s.png; \
		rsvg-convert -w $$s -h $$s $(ICON_LIGHT_SRC) -o $(SRC_DIR)/icons/icon$$s-light.png; \
	done
	@printf "$(GREEN)Icons updated in $(SRC_DIR)/icons/$(RESET)\n"

package-chrome: build ## Zip dist/ for Chrome Web Store (MV3)
	@printf "$(BLUE)Packaging Chrome...$(RESET)\n"
	cp $(SRC_DIR)/manifest.json $(BUILD_DIR)/manifest.json
	cd $(BUILD_DIR) && zip -r ../fontsource-chrome-$(VERSION).zip .
	@printf "$(GREEN)Created fontsource-chrome-$(VERSION).zip$(RESET)\n"

package-firefox: build ## Zip dist/ for Firefox (MV2 manifest)
	@printf "$(BLUE)Packaging Firefox...$(RESET)\n"
	cp $(SRC_DIR)/manifest.firefox.json $(BUILD_DIR)/manifest.json
	cd $(BUILD_DIR) && zip -r ../fontsource-firefox-$(VERSION).zip .
	@printf "$(GREEN)Created fontsource-firefox-$(VERSION).zip$(RESET)\n"

package-safari: build ## macOS: copy Safari manifest into dist, then rebuild Safari Xcode project via packager
	@printf "$(BLUE)Packaging Safari Web Extension (Xcode)…$(RESET)\n"
	@test "$$(uname -s)" = "Darwin" || { printf "$(YELLOW)package-safari requires macOS (xcrun safari-web-extension-packager).$(RESET)\n"; exit 1; }
	@xcrun --find safari-web-extension-packager >/dev/null 2>&1 || { printf "$(YELLOW)safari-web-extension-packager not found. Install Xcode Command Line Tools / Xcode.$(RESET)\n"; exit 1; }
	@test -d "$(SAFARI_XCODEPROJ)" || { printf "$(YELLOW)Missing $(SAFARI_XCODEPROJ). Create the wrapper once from the repo root, e.g.$(RESET)\n"; printf "  $(GREEN)xcrun safari-web-extension-packager \"$(CURDIR)/$(BUILD_DIR)\" --project-location \"$(CURDIR)/safari\" --app-name FontSource --bundle-identifier com.example.fontsource --swift --no-open --no-prompt$(RESET)\n"; exit 1; }
	cp $(SRC_DIR)/manifest.safari.json $(BUILD_DIR)/manifest.json
	xcrun safari-web-extension-packager "$(CURDIR)/$(BUILD_DIR)" \
		--rebuild-project "$(CURDIR)/$(SAFARI_XCODEPROJ)" \
		--copy-resources \
		--no-open \
		--no-prompt \
		--force
	@printf "$(GREEN)Safari Xcode project updated at $(SAFARI_XCODE_DIR).$(RESET)\n"
	@printf "$(YELLOW)Next:$(RESET) Open $(YELLOW)$(SAFARI_XCODE_DIR)/FontSource.xcodeproj$(RESET) in Xcode, select the macOS/iOS scheme, then $(YELLOW)Product > Archive$(RESET) for App Store / notarized distribution.\n"

bundle: package-safari ## Alias for Safari distribution prep (same as package-safari)

package: package-chrome package-firefox package-safari ## Chrome/Firefox zips + Safari Xcode packager (macOS only)
	@printf "$(GREEN)All platform packages finished.$(RESET)\n"

load-chrome: ## Print steps to load unpacked extension in Chrome
	@printf "$(BLUE)Chrome — load unpacked$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Run $(YELLOW)make build$(RESET) so $(BUILD_DIR)/ has a full copy of the extension.\n"
	@printf "$(GREEN)2.$(RESET) Open $(YELLOW)chrome://extensions/$(RESET)\n"
	@printf "$(GREEN)3.$(RESET) Turn on $(YELLOW)Developer mode$(RESET) (top right).\n"
	@printf "$(GREEN)4.$(RESET) Click $(YELLOW)Load unpacked$(RESET) and choose this repo’s $(YELLOW)$(BUILD_DIR)$(RESET) folder (must contain manifest.json).\n"
	@printf "\n"
	@printf "$(YELLOW)Tip:$(RESET) After code changes, click $(YELLOW)Reload$(RESET) on the extension card, or rebuild and reload.\n"

load-firefox: ## Print steps to load a temporary add-on in Firefox
	@printf "$(BLUE)Firefox — temporary add-on$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Open $(YELLOW)about:debugging#/runtime/this-firefox$(RESET)\n"
	@printf "$(GREEN)2.$(RESET) Click $(YELLOW)Load Temporary Add-on…$(RESET)\n"
	@printf "$(GREEN)3.$(RESET) Pick $(YELLOW)$(SRC_DIR)/manifest.firefox.json$(RESET) (Firefox uses the MV2 manifest; do not select manifest.json).\n"
	@printf "\n"
	@printf "$(YELLOW)Note:$(RESET) Temporary add-ons are removed when Firefox closes. For MV3 testing, use a Firefox build/channel that supports your manifest.\n"

load-safari: ## Print steps to load a Safari Web Extension folder
	@printf "$(BLUE)Safari — Web Extension (not legacy .safariextension)$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Run $(YELLOW)make build$(RESET). Safari needs a folder whose root is the extension root (we use $(YELLOW)$(BUILD_DIR)$(RESET)).\n"
	@printf "$(GREEN)2.$(RESET) Safari menu $(YELLOW)> Settings$(RESET): under $(YELLOW)Advanced$(RESET), enable $(YELLOW)Show features for web developers$(RESET) (wording may vary by version).\n"
	@printf "$(GREEN)3.$(RESET) Open the $(YELLOW)Developer$(RESET) settings tab: enable $(YELLOW)Allow unsigned extensions$(RESET) if you are sideloading unsigned builds (may reset when Safari quits).\n"
	@printf "$(GREEN)4.$(RESET) Still in Settings: on supported Safari versions, use $(YELLOW)Add Temporary Extension…$(RESET) (Developer tab) and select the $(YELLOW)$(BUILD_DIR)$(RESET) folder that contains manifest.json.\n"
	@printf "$(GREEN)5.$(RESET) If your Safari version has no “temporary extension” option, use Xcode’s $(YELLOW)safari-web-extension-converter$(RESET) or Apple’s Safari Web Extension App template, then run the container app once so the extension appears under Settings $(YELLOW)> Extensions$(RESET).\n"
	@printf "\n"
	@printf "$(YELLOW)There is no FontSource.safariextension bundle in this repo; Safari Web Extensions use manifest.json like Chrome.$(RESET)\n"

load: load-chrome ## Same as load-chrome (no browser auto-detect)

uninstall-chrome: ## Print steps to remove the extension from Chrome
	@printf "$(BLUE)Chrome — remove extension$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Open $(YELLOW)chrome://extensions/$(RESET)\n"
	@printf "$(GREEN)2.$(RESET) Find FontSource and click $(YELLOW)Remove$(RESET).\n"

uninstall-firefox: ## Print steps to remove the add-on from Firefox
	@printf "$(BLUE)Firefox — remove add-on$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Open $(YELLOW)about:addons$(RESET)\n"
	@printf "$(GREEN)2.$(RESET) Remove FontSource from Extensions.\n"

uninstall-safari: ## Print steps to disable/remove the extension in Safari
	@printf "$(BLUE)Safari — disable extension$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Safari $(YELLOW)> Settings > Extensions$(RESET): uncheck or uninstall FontSource.\n"

uninstall: uninstall-chrome ## Same as uninstall-chrome

deploy-chrome: package-chrome ## Package Chrome zip and print Web Store upload steps
	@printf "$(BLUE)Chrome Web Store$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Open $(YELLOW)https://chrome.google.com/webstore/devconsole$(RESET)\n"
	@printf "$(GREEN)2.$(RESET) Create or select an item, then upload $(YELLOW)fontsource-chrome-$(VERSION).zip$(RESET) (the Store expects a zip, not a .crx).\n"

deploy-firefox: package-firefox ## Package Firefox zip and print AMO upload steps
	@printf "$(BLUE)Firefox Add-ons (AMO)$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Open $(YELLOW)https://addons.mozilla.org/developers/$(RESET)\n"
	@printf "$(GREEN)2.$(RESET) Submit $(YELLOW)fontsource-firefox-$(VERSION).zip$(RESET) and complete listing metadata.\n"

deploy-safari: package-safari ## After package-safari, print Xcode archive / App Store notes
	@printf "$(BLUE)Safari distribution$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Open $(YELLOW)$(SAFARI_XCODE_DIR)/FontSource.xcodeproj$(RESET) and set signing team / bundle IDs for your Apple Developer account.\n"
	@printf "$(GREEN)2.$(RESET) $(YELLOW)Product > Archive$(RESET), then distribute via Organizer (App Store Connect or notarized export).\n"
	@printf "$(GREEN)3.$(RESET) See $(YELLOW)https://developer.apple.com/documentation/safariservices/safari_web_extensions$(RESET)\n"

deploy: deploy-chrome deploy-firefox deploy-safari ## Package all zips and print store reminders
	@printf "$(GREEN)Packaging/reminders finished for all targets.$(RESET)\n"

watch: ## Suggest a watchexec command for iterative builds
	@printf "$(BLUE)Watch mode$(RESET)\n"
	@printf "Example: $(YELLOW)watchexec -w $(SRC_DIR) -e js,html,css,json 'make build'$(RESET)\n"

help: ## List targets and short descriptions
	@printf "$(BLUE)FontSource$(RESET) — $(YELLOW)make$(RESET) [target]\n\n"
	@grep -E '^[a-zA-Z0-9_.-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  $(GREEN)%-22s$(RESET) %s\n", $$1, $$2}'
	@printf "\n$(YELLOW)Typical dev:$(RESET) $(GREEN)make install$(RESET), then $(GREEN)make build$(RESET), then $(GREEN)make load-chrome$(RESET) / $(GREEN)make load-firefox$(RESET) / $(GREEN)make load-safari$(RESET).\n"
	@printf "$(YELLOW)Full clean:$(RESET) $(GREEN)make distclean$(RESET) removes $(BUILD_DIR) and node_modules.\n"
	@printf "$(YELLOW)Release version:$(RESET) $(GREEN)make bump$(RESET) (patch), $(GREEN)make bump BUMP=minor$(RESET), or $(GREEN)make bump BUMP=major$(RESET).\n"
	@printf "$(YELLOW)Panel baseline:$(RESET) $(GREEN)make test-panel-baseline-record$(RESET) then commit $(YELLOW)tests/baselines/*.txt$(RESET); $(GREEN)make test-panel-baseline-check$(RESET) to diff. Needs $(YELLOW)npx playwright install chromium$(RESET).\n"
