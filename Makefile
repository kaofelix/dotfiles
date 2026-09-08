STOW_PACKAGES = bin zsh git pi agents tmux ghostty herdr mise keybindings
STOW_DIR = .
TARGET_DIR = ${HOME}

.PHONY: stow adopt $(STOW_PACKAGES)

# Always restow everything
stow: $(STOW_PACKAGES)
	@echo "🚚 All packages stowed!"

bin zsh git pi agents tmux ghostty herdr mise keybindings:
	@echo "📦 $@"
	stow -v -R $@ --target=$(TARGET_DIR)
	@echo ""

# Adopting copies target files into this repository, so require an explicit package.
adopt:
	@test -n "$(PACKAGE)" || (echo "Usage: make adopt PACKAGE=<package>" >&2; exit 2)
	@case " $(STOW_PACKAGES) " in *" $(PACKAGE) "*) ;; *) echo "Unknown package: $(PACKAGE)" >&2; exit 2;; esac
	stow -v -R $(PACKAGE) --target=$(TARGET_DIR) --adopt

.PHONY: setup update gh-config pi-auth pifind-deps shell-completions zgenom
setup:
	brew bundle install
	$(MAKE) zgenom
	$(MAKE) stow
	mise install
	$(MAKE) pifind-deps
	$(MAKE) shell-completions
	$(MAKE) gh-config
	$(MAKE) pi-auth

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
