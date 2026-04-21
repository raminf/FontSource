# FontSource Makefile — build, package, and load the browser extension

SHELL := /bin/bash
.DEFAULT_GOAL := help

VERSION := 1.0.3
# All make build / package outputs live under artifacts/ (gitignored).
ARTIFACTS_DIR := artifacts
CHROME_BUILD_DIR := $(ARTIFACTS_DIR)/chrome
FIREFOX_BUILD_DIR := $(ARTIFACTS_DIR)/firefox
SAFARI_BUILD_DIR := $(ARTIFACTS_DIR)/safari
SRC_DIR := src

BLUE := \033[34m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m

.PHONY: install build build-chrome build-firefox build-safari clean distclean test lint format icons bump \
	test-panel-baseline-record test-panel-baseline-check \
	package package-chrome package-firefox package-safari \
	load-chrome load-firefox load-safari \
	uninstall-chrome uninstall-firefox uninstall-safari \
	deploy deploy-chrome deploy-firefox deploy-safari watch help

install: ## Install npm dependencies
	@printf "$(BLUE)Installing dependencies...$(RESET)\n"
	npm install
	@printf "$(GREEN)Dependencies installed.$(RESET)\n"

clean: ## Remove artifacts/ (unpacked extension + zips; keeps node_modules)
	@printf "$(GREEN)Clean complete ($(ARTIFACTS_DIR) removed).$(RESET)\n"
	@printf "$(BLUE)Removing $(ARTIFACTS_DIR)...$(RESET)\n"
	rm -rf $(ARTIFACTS_DIR)

distclean: clean ## Remove artifacts/ and node_modules
	@printf "$(BLUE)Removing node_modules...$(RESET)\n"
	rm -rf node_modules
	@printf "$(GREEN)distclean complete.$(RESET)\n"

build: build-chrome build-firefox build-safari ## Build all browser targets under artifacts/
	@printf "$(GREEN)All browser builds finished.$(RESET)\n"

define build_extension_tree
	@test -f $(SRC_DIR)/icons/icon48.png && test -f $(SRC_DIR)/icons/icon128.png || { printf "$(YELLOW)Missing PNG icons under $(SRC_DIR)/icons/. Run $(GREEN)make icons$(YELLOW) (needs rsvg-convert), or restore tracked files from git.$(RESET)\n"; exit 1; }
	rm -rf $(1)
	mkdir -p $(1)
	cp -R $(SRC_DIR)/* $(1)/
	rm -f $(1)/manifest.firefox.json $(1)/manifest.safari.json
	find $(1) -name '.DS_Store' -delete
endef

define prune_chrome_tree
	rm -f $(1)/background.firefox.js $(1)/popup/popup.firefox.html
endef

define prune_firefox_tree
	rm -f $(1)/manifest.json $(1)/manifest.safari.json
endef

define prune_safari_tree
	rm -f $(1)/background.firefox.js $(1)/popup/popup.firefox.html $(1)/manifest.firefox.json
endef

build-chrome: ## Copy src to artifacts/chrome/ (Chrome MV3 manifest)
	@printf "$(BLUE)Building extension for Chrome…$(RESET)\n"
	$(call build_extension_tree,$(CHROME_BUILD_DIR))
	$(call prune_chrome_tree,$(CHROME_BUILD_DIR))
	@printf "$(GREEN)Build complete.$(RESET)\n"
	@printf "$(YELLOW)Load unpacked in Chrome from:$(RESET) $(GREEN)$(CHROME_BUILD_DIR)/$(RESET)\n"

build-firefox: ## Copy src to artifacts/firefox/ with MV2 manifest (Firefox; no service_worker)
	@printf "$(BLUE)Building extension for Firefox (MV2 manifest)…$(RESET)\n"
	$(call build_extension_tree,$(FIREFOX_BUILD_DIR))
	$(call prune_firefox_tree,$(FIREFOX_BUILD_DIR))
	cp $(SRC_DIR)/manifest.firefox.json $(FIREFOX_BUILD_DIR)/manifest.json
	@printf "$(GREEN)Firefox build complete.$(RESET)\n"
	@printf "$(YELLOW)Temporary add-on: pick $(YELLOW)$(FIREFOX_BUILD_DIR)/manifest.json$(RESET) (MV2). See $(GREEN)make load-firefox$(RESET).\n"

build-safari: ## Copy src to artifacts/safari/ with Safari MV3 manifest
	@printf "$(BLUE)Building extension for Safari…$(RESET)\n"
	$(call build_extension_tree,$(SAFARI_BUILD_DIR))
	$(call prune_safari_tree,$(SAFARI_BUILD_DIR))
	cp $(SRC_DIR)/manifest.safari.json $(SAFARI_BUILD_DIR)/manifest.json
	@printf "$(GREEN)Safari build complete.$(RESET)\n"
	@printf "$(YELLOW)Load unpacked in Safari from:$(RESET) $(GREEN)$(SAFARI_BUILD_DIR)/$(RESET)\n"

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

bump: ## Bump release version: Makefile VERSION, manifests, package.json/lock (BUMP=patch|minor|major)
	@printf "$(BLUE)Bumping version ($(YELLOW)BUMP=$(or $(BUMP),patch)$(BLUE))...$(RESET)\n"
	@bash scripts/bump-version.sh "$(or $(BUMP),patch)"
	@printf "$(GREEN)Bump complete.$(RESET)\n"

test-panel-baseline-record: ## Record panel listing baseline (needs make build-chrome + Playwright chromium). Optional: PANEL_ARGS='--slug=fixture --url=https://…'
	@printf "$(BLUE)Recording panel baseline ($(YELLOW)$(CHROME_BUILD_DIR)/$(BLUE) extension, Playwright)...$(RESET)\n"
	node tests/panel-baseline-runner.mjs record $(PANEL_ARGS)
	@printf "$(GREEN)Baseline written under tests/baselines/$(RESET)\n"

test-panel-baseline-check: ## Diff current scan vs tests/baselines/<slug>.txt (same args as record)
	@printf "$(BLUE)Checking panel baseline...$(RESET)\n"
	node tests/panel-baseline-runner.mjs check $(PANEL_ARGS)
	@printf "$(GREEN)Panel baseline matches.$(RESET)\n"

ICON_SRC := media/icon1024.svg
ICON_LIGHT_SRC := media/icon1024-light.svg

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

package-chrome: build-chrome ## Zip artifacts/chrome/ for Chrome Web Store (MV3)
	@printf "$(BLUE)Packaging Chrome...$(RESET)\n"
	cp $(SRC_DIR)/manifest.json $(CHROME_BUILD_DIR)/manifest.json
	cd $(CHROME_BUILD_DIR) && zip -r ../fontsource-chrome-$(VERSION).zip . -x "*/.DS_Store" ".DS_Store" "__MACOSX/*"
	@printf "$(GREEN)Created $(ARTIFACTS_DIR)/fontsource-chrome-$(VERSION).zip$(RESET)\n"

package-firefox: build-firefox ## Zip artifacts/firefox/ (MV2 manifest already in manifest.json)
	@printf "$(BLUE)Packaging Firefox...$(RESET)\n"
	cd $(FIREFOX_BUILD_DIR) && zip -r ../fontsource-firefox-$(VERSION).zip . -x "*/.DS_Store" ".DS_Store" "__MACOSX/*"
	@printf "$(GREEN)Created $(ARTIFACTS_DIR)/fontsource-firefox-$(VERSION).zip$(RESET)\n"
	@printf "$(YELLOW)Firefox:$(RESET) for $(YELLOW)about:debugging$(RESET) temporary load, prefer $(GREEN)$(FIREFOX_BUILD_DIR)/manifest.json$(RESET) (not the zip). For $(YELLOW)Install Add-on From File$(RESET), use this zip only after $(GREEN)make package-firefox$(RESET); it includes $(YELLOW)browser_specific_settings.gecko.id$(RESET).\n"

package-safari: build-safari ## Zip artifacts/safari/ for App Store Connect Safari Web Extension Packager
	@printf "$(BLUE)Packaging Safari web extension archive...$(RESET)\n"
	cd $(SAFARI_BUILD_DIR) && zip -r ../fontsource-safari-webext-$(VERSION).zip . -x "*/.DS_Store" ".DS_Store" "__MACOSX/*"
	@printf "$(GREEN)Created $(ARTIFACTS_DIR)/fontsource-safari-webext-$(VERSION).zip$(RESET)\n"
	@printf "$(YELLOW)Upload this archive in App Store Connect > Xcode Cloud > Safari Web Extension Packager.$(RESET)\n"

package: package-chrome package-firefox package-safari ## Build all distribution archives
	@printf "$(GREEN)All platform packages finished.$(RESET)\n"

load-chrome: ## Print steps to load unpacked extension in Chrome
	@printf "$(BLUE)Chrome — load unpacked$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Run $(YELLOW)make build-chrome$(RESET) so $(CHROME_BUILD_DIR)/ has a full copy of the extension.\n"
	@printf "$(GREEN)2.$(RESET) Open $(YELLOW)chrome://extensions/$(RESET)\n"
	@printf "$(GREEN)3.$(RESET) Turn on $(YELLOW)Developer mode$(RESET) (top right).\n"
	@printf "$(GREEN)4.$(RESET) Click $(YELLOW)Load unpacked$(RESET) and choose this repo’s $(YELLOW)$(CHROME_BUILD_DIR)$(RESET) folder (must contain manifest.json).\n"
	@printf "\n"
	@printf "$(YELLOW)Tip:$(RESET) After code changes, click $(YELLOW)Reload$(RESET) on the extension card, or rebuild and reload.\n"

load-firefox: ## Print steps to load a temporary add-on in Firefox
	@printf "$(BLUE)Firefox — temporary add-on$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Run $(YELLOW)make build-firefox$(RESET) (Firefox needs MV2: $(YELLOW)background.scripts$(RESET), not $(YELLOW)service_worker$(RESET)).\n"
	@printf "$(GREEN)2.$(RESET) Open $(YELLOW)about:debugging#/runtime/this-firefox$(RESET)\n"
	@printf "$(GREEN)3.$(RESET) Click $(YELLOW)Load Temporary Add-on…$(RESET)\n"
	@printf "$(GREEN)4.$(RESET) Select $(YELLOW)$(FIREFOX_BUILD_DIR)/manifest.json$(RESET) (not a .zip).\n"
	@printf "\n"
	@printf "$(YELLOW)Avoid these (they match common console errors):$(RESET)\n"
	@printf "  $(RED)✗$(RESET) $(YELLOW)make build-chrome$(RESET) then load $(CHROME_BUILD_DIR) — that is $(YELLOW)Chrome MV3$(RESET); Firefox will say $(YELLOW)service_worker is disabled$(RESET).\n"
	@printf "  $(RED)✗$(RESET) Load $(YELLOW)$(ARTIFACTS_DIR)/fontsource-chrome-$(VERSION).zip$(RESET) in Firefox — same MV3 manifest.\n"
	@printf "  $(RED)✗$(RESET) $(YELLOW)Install Add-on From File$(RESET) with an old zip built before MV2 $(YELLOW)browser_specific_settings.gecko.id$(RESET) — use a fresh $(GREEN)make package-firefox$(RESET) zip or temporary add-on from $(FIREFOX_BUILD_DIR)/manifest.json.\n"
	@printf "  $(RED)✗$(RESET) Stale tree: run $(GREEN)make build-firefox$(RESET) again if you ever see $(YELLOW)windows$(RESET) permission errors (removed upstream).\n"
	@printf "\n"
	@printf "$(YELLOW)Alternative:$(RESET) pick $(YELLOW)$(SRC_DIR)/manifest.firefox.json$(RESET) (files resolve from $(YELLOW)src/$(RESET)).\n"
	@printf "\n"
	@printf "$(YELLOW)Note:$(RESET) Temporary add-ons are removed when Firefox closes.\n"

load-safari: ## Print steps to load a Safari Web Extension folder
	@printf "$(BLUE)Safari — Web Extension (not legacy .safariextension)$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Run $(YELLOW)make build-safari$(RESET). Safari needs a folder whose root is the extension root (we use $(YELLOW)$(SAFARI_BUILD_DIR)$(RESET)).\n"
	@printf "$(GREEN)2.$(RESET) Safari menu $(YELLOW)> Settings$(RESET): under $(YELLOW)Advanced$(RESET), enable $(YELLOW)Show features for web developers$(RESET) (wording may vary by version).\n"
	@printf "$(GREEN)3.$(RESET) Open the $(YELLOW)Developer$(RESET) settings tab: enable $(YELLOW)Allow unsigned extensions$(RESET) if you are sideloading unsigned builds (may reset when Safari quits).\n"
	@printf "$(GREEN)4.$(RESET) Still in Settings: on supported Safari versions, use $(YELLOW)Add Temporary Extension…$(RESET) (Developer tab) and select the $(YELLOW)$(SAFARI_BUILD_DIR)$(RESET) folder that contains manifest.json.\n"
	@printf "$(GREEN)5.$(RESET) For App Store Connect / Xcode Cloud packaging, run $(YELLOW)make package-safari$(RESET) and upload $(YELLOW)$(ARTIFACTS_DIR)/fontsource-safari-webext-$(VERSION).zip$(RESET).\n"
	@printf "\n"
	@printf "$(YELLOW)There is no FontSource.safariextension bundle in this repo; Safari Web Extensions use manifest.json like Chrome.$(RESET)\n"

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

deploy-chrome: package-chrome ## Package Chrome zip and print Web Store upload steps
	@printf "$(BLUE)Chrome Web Store$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Open $(YELLOW)https://chrome.google.com/webstore/devconsole$(RESET)\n"
	@printf "$(GREEN)2.$(RESET) Create or select an item, then upload $(YELLOW)$(ARTIFACTS_DIR)/fontsource-chrome-$(VERSION).zip$(RESET) (the Store expects a zip, not a .crx).\n"

deploy-firefox: package-firefox ## Package Firefox zip and print AMO upload steps
	@printf "$(BLUE)Firefox Add-ons (AMO)$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Open $(YELLOW)https://addons.mozilla.org/developers/$(RESET)\n"
	@printf "$(GREEN)2.$(RESET) Submit $(YELLOW)$(ARTIFACTS_DIR)/fontsource-firefox-$(VERSION).zip$(RESET) and complete listing metadata.\n"

deploy-safari: package-safari ## Print Safari Web Extension Packager upload steps
	@printf "$(BLUE)Safari distribution$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Open App Store Connect and select your app record.\n"
	@printf "$(GREEN)2.$(RESET) Open the $(YELLOW)Xcode Cloud$(RESET) tab, then $(YELLOW)Safari Web Extension Packager$(RESET).\n"
	@printf "$(GREEN)3.$(RESET) Upload $(YELLOW)$(ARTIFACTS_DIR)/fontsource-safari-webext-$(VERSION).zip$(RESET).\n"
	@printf "$(GREEN)4.$(RESET) Review the packaged build in App Store Connect / TestFlight before submission.\n"

deploy: deploy-chrome deploy-firefox deploy-safari ## Package all zips and print store reminders
	@printf "$(GREEN)Packaging/reminders finished for all targets.$(RESET)\n"

watch: ## Suggest a watchexec command for iterative builds
	@printf "$(BLUE)Watch mode$(RESET)\n"
	@printf "Example: $(YELLOW)watchexec -w $(SRC_DIR) -e js,html,css,json 'make build'$(RESET)\n"

help: ## List targets and short descriptions
	@printf "$(BLUE)FontSource$(RESET) — $(YELLOW)make$(RESET) [target]\n\n"
	@grep -E '^[a-zA-Z0-9_.-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  $(GREEN)%-22s$(RESET) %s\n", $$1, $$2}'
	@printf "\n$(YELLOW)Typical dev:$(RESET) $(GREEN)make install$(RESET); all browsers: $(GREEN)make build$(RESET). Chrome: $(GREEN)make build-chrome$(RESET) + $(GREEN)make load-chrome$(RESET). Firefox: $(GREEN)make build-firefox$(RESET) + $(GREEN)make load-firefox$(RESET). Safari: $(GREEN)make build-safari$(RESET) + $(GREEN)make load-safari$(RESET).\n"
	@printf "$(YELLOW)Full clean:$(RESET) $(GREEN)make distclean$(RESET) removes $(ARTIFACTS_DIR) and node_modules.\n"
	@printf "$(YELLOW)Release version:$(RESET) $(GREEN)make bump$(RESET) (patch), $(GREEN)make bump BUMP=minor$(RESET), or $(GREEN)make bump BUMP=major$(RESET).\n"
	@printf "$(YELLOW)Panel baseline:$(RESET) $(GREEN)make test-panel-baseline-record$(RESET) then commit $(YELLOW)tests/baselines/*.txt$(RESET); $(GREEN)make test-panel-baseline-check$(RESET) to diff. Needs $(YELLOW)npx playwright install chromium$(RESET).\n"
