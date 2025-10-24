STOW_PACKAGES = bin zsh git
STOW_DIR = .
TARGET_DIR = ${HOME}

.PHONY: stow $(STOW_PACKAGES)

# Always restow everything
stow: $(STOW_PACKAGES)
	@echo "🚚 All packages stowed!"

$(STOW_PACKAGES):
	@echo "📦 $@"
	stow -v -R $@ --target=$(TARGET_DIR)
	@echo ""
