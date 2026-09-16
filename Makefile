CHEZMOI ?= chezmoi
SOURCE_DIR := $(CURDIR)
TARGET_DIR ?= $(HOME)
CHEZMOI_ARGS = --source=$(SOURCE_DIR) --destination=$(TARGET_DIR)

.PHONY: apply diff verify add setup update gh-config pi-auth pifind-deps shell-completions test test-migration test-adoption

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

setup:
	brew bundle install
	$(MAKE) apply
	mise install
	$(MAKE) pifind-deps
	$(MAKE) shell-completions
	$(MAKE) gh-config
	$(MAKE) pi-auth

shell-completions:
	mise exec -- "$(TARGET_DIR)/.local/bin/update-zsh-completions"

pifind-deps:
	mise exec -- npm ci --prefix "$(TARGET_DIR)/.local/lib/pifind"

gh-config:
	mise exec -- gh config set git_protocol ssh --host github.com

pi-auth:
	"$(TARGET_DIR)/.local/bin/pi-auth-setup"

update:
	brew update
	brew upgrade
	mise upgrade
	$(MAKE) apply
	$(MAKE) shell-completions

# Application tests do not touch HOME.
test:
	./tests/pi-auth-setup.test.sh
	./tests/pi-auth-setup-generation.test.sh
	npm ci --prefix home/dot_local/lib/pifind
	npm test --prefix home/dot_local/lib/pifind
	npm ci --prefix home/dot_pi/agent/extensions/footer
	npm test --prefix home/dot_pi/agent/extensions/footer
	cd home/dot_pi/agent/extensions/pi-herdr && bun install --no-save && bun test

# Full isolated Stow-vs-chezmoi parity, idempotence, and verify checks.
test-migration:
	./scripts/validate-chezmoi-migration
	./scripts/test-chezmoi-external
	$(MAKE) test-adoption

test-adoption:
	./tests/adopt-from-stow.test.sh
