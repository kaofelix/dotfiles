STOW_PACKAGES = bin zsh git claude
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

# Unstow all packages
.PHONY: unstow
unstow:
	@echo "🗑️  Unstowing all packages..."
	@for pkg in $(STOW_PACKAGES); do \
		echo "📦 $$pkg"; \
		stow -v -D $$pkg --target=$(TARGET_DIR); \
		echo ""; \
	done
	@echo "✅ All packages unstowed!"

# Download ZaiTransformer files
.PHONY: download-zai
download-zai:
	@echo "⬇️  Downloading ZaiTransformer files..."
	@mkdir -p claude/.claude-code-router/
	@curl -sL https://raw.githubusercontent.com/Bedolla/ZaiTransformer/main/zai.js -o claude/.claude-code-router/zai.js
	@curl -sL https://raw.githubusercontent.com/Bedolla/ZaiTransformer/main/zai-debug.js -o claude/.claude-code-router/zai-debug.js
	@echo "✅ ZaiTransformer files downloaded successfully!"
