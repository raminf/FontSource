# FontSource Makefile — build, package, and load the browser extension

SHELL := /bin/bash
.DEFAULT_GOAL := help

VERSION := 1.0.0
BUILD_DIR := dist
SRC_DIR := src

BLUE := \033[34m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

.PHONY: all install build clean clean-dist distclean test lint format icons \
	package package-chrome package-firefox package-safari \
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

test: ## Run tests (placeholder)
	@printf "$(BLUE)Running tests...$(RESET)\n"
	@printf "$(YELLOW)No tests configured yet.$(RESET)\n"

lint: ## Lint JavaScript
	@printf "$(BLUE)Linting...$(RESET)\n"
	npm run lint
	@printf "$(GREEN)Lint complete.$(RESET)\n"

format: ## Format with Prettier
	@printf "$(BLUE)Formatting...$(RESET)\n"
	npm run format
	@printf "$(GREEN)Format complete.$(RESET)\n"

icons: ## Regenerate src/icons PNGs from media/1024.svg (needs rsvg-convert)
	@command -v rsvg-convert >/dev/null 2>&1 || { printf "$(YELLOW)rsvg-convert not found. Install with: brew install librsvg$(RESET)\n"; exit 1; }
	mkdir -p $(SRC_DIR)/icons
	for s in 16 24 32 48 128; do \
		rsvg-convert -w $$s -h $$s media/1024.svg -o $(SRC_DIR)/icons/icon$$s.png; \
	done
	for s in 16 24 32; do \
		rsvg-convert -w $$s -h $$s media/icon1024-white.svg -o $(SRC_DIR)/icons/icon$$s-light.png; \
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

package-safari: build ## Zip dist/ for Safari web extension files (MV3)
	@printf "$(BLUE)Packaging Safari (web extension files)...$(RESET)\n"
	cp $(SRC_DIR)/manifest.safari.json $(BUILD_DIR)/manifest.json
	cd $(BUILD_DIR) && zip -r ../fontsource-safari-$(VERSION).zip .
	@printf "$(GREEN)Created fontsource-safari-$(VERSION).zip$(RESET)\n"
	@printf "$(YELLOW)App Store distribution still requires an Xcode wrapper app; see Apple’s “Packaging a web extension for Safari”.$(RESET)\n"

package: package-chrome package-firefox package-safari ## Create all platform zip packages
	@printf "$(GREEN)All platform zips created.$(RESET)\n"

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

deploy-safari: package-safari ## Package Safari zip and print App Store / Xcode notes
	@printf "$(BLUE)Safari distribution$(RESET)\n"
	@printf "$(GREEN)1.$(RESET) Apple distributes Safari Web Extensions inside a macOS/iOS app; use Xcode and the Apple Developer Program.\n"
	@printf "$(GREEN)2.$(RESET) See $(YELLOW)https://developer.apple.com/documentation/safariservices$(RESET) (e.g. packaging a web extension for Safari).\n"

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
