STOW_PACKAGES = bin zsh git pi tmux ghostty herdr mise
STOW_DIR = .
TARGET_DIR = ${HOME}

.PHONY: stow adopt $(STOW_PACKAGES)

# Always restow everything
stow: $(STOW_PACKAGES)
	@echo "🚚 All packages stowed!"

bin zsh git pi tmux ghostty herdr mise:
	@echo "📦 $@"
	stow -v -R $@ --target=$(TARGET_DIR)
	@echo ""

# Adopting copies target files into this repository, so require an explicit package.
adopt:
	@test -n "$(PACKAGE)" || (echo "Usage: make adopt PACKAGE=<package>" >&2; exit 2)
	@case " $(STOW_PACKAGES) " in *" $(PACKAGE) "*) ;; *) echo "Unknown package: $(PACKAGE)" >&2; exit 2;; esac
	stow -v -R $(PACKAGE) --target=$(TARGET_DIR) --adopt

.PHONY: setup update pi-auth
setup:
	brew bundle install
	$(MAKE) stow
	mise install
	$(MAKE) pi-auth

pi-auth:
	./bin/.local/bin/pi-auth-setup

update:
	brew update
	brew upgrade
	mise upgrade

.PHONY: unstow
unstow:
	@echo "🗑️  Unstowing all packages..."
	@for pkg in $(STOW_PACKAGES); do \
		echo "📦 $$pkg"; \
		stow -v -D $$pkg --target=$(TARGET_DIR); \
		echo ""; \
	done
	@echo "✅ All packages unstowed!"
