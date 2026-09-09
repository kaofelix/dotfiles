PLATFORM := $(shell uname -s)
STOW_PACKAGES = bin zsh git pi agents tmux ghostty herdr mise
ifeq ($(PLATFORM),Darwin)
STOW_PACKAGES += keybindings macos
endif
STOW_DIR = .
TARGET_DIR = ${HOME}

.PHONY: stow adopt $(STOW_PACKAGES)

# Always restow everything
stow: $(STOW_PACKAGES)
	@echo "🚚 All packages stowed!"

bin zsh git pi agents tmux ghostty herdr mise keybindings macos:
	@echo "📦 $@"
	stow -v -R $@ --target=$(TARGET_DIR)
	@echo ""

# Adopting copies target files into this repository, so require an explicit package.
adopt:
	@test -n "$(PACKAGE)" || (echo "Usage: make adopt PACKAGE=<package>" >&2; exit 2)
	@case " $(STOW_PACKAGES) " in *" $(PACKAGE) "*) ;; *) echo "Unknown package: $(PACKAGE)" >&2; exit 2;; esac
	stow -v -R $(PACKAGE) --target=$(TARGET_DIR) --adopt

.PHONY: setup update gh-config pi-auth pifind-deps shell-completions zgenom
setup: brew-bootstrap
	. "$${XDG_CONFIG_HOME:-$$HOME/.config}/homebrew/shellenv.sh"; $(MAKE) setup-tools

.PHONY: brew-bootstrap setup-tools
brew-bootstrap:
	sh scripts/bootstrap-brew.sh

setup-tools:
	brew bundle install
	$(MAKE) zgenom
	$(MAKE) stow
	mise trust "$(CURDIR)/mise/.config/mise/config.toml"
	mise install
	$(MAKE) pifind-deps
	$(MAKE) shell-completions
	$(MAKE) gh-config

# Optional platform applications and 1Password authentication are never part of setup.
.PHONY: setup-macos
setup-macos:
	@test "$(PLATFORM)" = Darwin || (echo "setup-macos requires macOS" >&2; exit 1)
	brew bundle install --file=Brewfile.macos
	$(MAKE) keybindings

zgenom: $(HOME)/.zgenom/zgenom.zsh

$(HOME)/.zgenom/zgenom.zsh:
	git clone https://github.com/jandamm/zgenom.git "$(HOME)/.zgenom"

shell-completions:
	mise exec -- ./bin/.local/bin/update-zsh-completions

pifind-deps:
	mise exec -- npm ci --prefix bin/.local/lib/pifind

gh-config:
	mise exec -- gh config set git_protocol ssh --host github.com

pi-auth:
	./bin/.local/bin/pi-auth-setup

.PHONY: check smoke
check:
	sh tests/bootstrap-brew.test.sh
	mise exec -- bash tests/pi-auth-setup.test.sh
	mise exec -- bash tests/pi-auth-setup-generation.test.sh
	mise exec -- npm test --prefix bin/.local/lib/pifind
	mise exec -- prek run --all-files

smoke:
	sh tests/setup-smoke.sh

update:
	brew update
	brew upgrade
	mise upgrade
	$(MAKE) shell-completions

.PHONY: unstow
unstow:
	@echo "🗑️  Unstowing all packages..."
	@for pkg in $(STOW_PACKAGES); do \
		echo "📦 $$pkg"; \
		stow -v -D $$pkg --target=$(TARGET_DIR); \
		echo ""; \
	done
	@echo "✅ All packages unstowed!"
