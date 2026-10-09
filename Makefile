CHEZMOI ?= $(shell command -v chezmoi 2>/dev/null || printf './scripts/run-with-homebrew chezmoi')
SOURCE_DIR := $(CURDIR)
TARGET_DIR ?= $(HOME)
CHEZMOI_ARGS = --source=$(SOURCE_DIR) --destination=$(TARGET_DIR)

.PHONY: apply diff verify add setup update gh-config pi-auth pifind-deps pi-extension-deps shell-completions test homebrew

apply:
	@mkdir -p "$(TARGET_DIR)"
	$(CHEZMOI) $(CHEZMOI_ARGS) apply

# Preview and verify the generated target state without changing it.
diff:
	$(CHEZMOI) $(CHEZMOI_ARGS) diff

verify:
	$(CHEZMOI) $(CHEZMOI_ARGS) verify

# Import one explicit target into chezmoi's source state.
add:
	@test -n "$(TARGET)" || (echo "Usage: make add TARGET=$(HOME)/path" >&2; exit 2)
	$(CHEZMOI) --source=$(SOURCE_DIR) add "$(TARGET)"

setup: homebrew
	./scripts/run-with-homebrew brew bundle install
	$(MAKE) apply
	./scripts/run-with-homebrew mise install
	$(MAKE) pifind-deps
	$(MAKE) pi-extension-deps
	$(MAKE) shell-completions
	$(MAKE) gh-config
	@if [ "$${NONINTERACTIVE:-}" = 1 ]; then \
		echo "Skipping Pi credential resolution in non-interactive setup; run make pi-auth later"; \
	else \
		$(MAKE) pi-auth; \
	fi

homebrew:
	./scripts/install-homebrew

shell-completions:
	./scripts/run-with-homebrew mise exec -- misecompsync

pifind-deps:
	./scripts/run-with-homebrew mise exec -- npm ci --prefix "$(SOURCE_DIR)/packages/pifind"

pi-extension-deps:
	./scripts/run-with-homebrew mise exec -- npm ci --prefix "$(SOURCE_DIR)/packages/pi-footer"
	./scripts/run-with-homebrew mise exec -- npm ci --prefix "$(SOURCE_DIR)/packages/pi-tavily"

gh-config:
	./scripts/run-with-homebrew mise exec -- gh config set git_protocol ssh --host github.com

pi-auth:
	"$(TARGET_DIR)/.local/bin/pi-auth-setup"

update:
	./scripts/run-with-homebrew brew update
	./scripts/run-with-homebrew brew upgrade
	./scripts/run-with-homebrew mise upgrade
	$(MAKE) apply
	$(MAKE) pifind-deps
	$(MAKE) pi-extension-deps
	$(MAKE) shell-completions

# Application tests do not touch HOME.
test:
	./tests/platform-rendering.test.sh
	bun test tests/python-env.test.ts
	./tests/pi-auth-setup.test.sh
	./tests/pi-auth-setup-generation.test.sh
	npm ci --prefix packages/pifind
	npm test --prefix packages/pifind
	npm ci --prefix packages/pi-footer
	npm test --prefix packages/pi-footer
	npm ci --prefix packages/pi-tavily
	npm test --prefix packages/pi-tavily
	npm run typecheck --prefix packages/pi-tavily
	cd home/dot_pi/agent/extensions/pi-herdr && bun install --no-save && bun test
