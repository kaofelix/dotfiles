STOW_PACKAGES = bin zsh git claude pi tmux ghostty herdr
STOW_DIR = .
TARGET_DIR = ${HOME}

.PHONY: stow $(STOW_PACKAGES)

# Always restow everything
stow: $(STOW_PACKAGES)
	@echo "🚚 All packages stowed!"

bin zsh git claude pi tmux ghostty herdr:
	@echo "📦 $@"
	stow -v -R $@ --target=$(TARGET_DIR) --adopt
	@echo ""

.PHONY: unstow
unstow:
	@echo "🗑️  Unstowing all packages..."
	@for pkg in $(STOW_PACKAGES); do \
		echo "📦 $$pkg"; \
		stow -v -D $$pkg --target=$(TARGET_DIR); \
		echo ""; \
	done
	@echo "✅ All packages unstowed!"
