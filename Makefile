STOW_PACKAGES = bin zsh git pi tmux ghostty herdr mise
STOW_DIR = .
TARGET_DIR = ${HOME}

.PHONY: stow $(STOW_PACKAGES)

# Always restow everything
stow: $(STOW_PACKAGES)
	@echo "🚚 All packages stowed!"

bin zsh git pi tmux ghostty herdr mise:
	@echo "📦 $@"
	stow -v -R $@ --target=$(TARGET_DIR) --adopt
	@echo ""

.PHONY: setup update
setup:
	brew bundle install
	$(MAKE) stow
	mise install

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
