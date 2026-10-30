SOURCE_DIR := $(CURDIR)
LOCAL_PACKAGES := pifind pi-footer pi-tavily
NPM ?= npm
BREW_ENV := ./scripts/run-with-homebrew
CHEZMOI := $(BREW_ENV) chezmoi --source="$(SOURCE_DIR)" --destination="$(HOME)"

.PHONY: help setup sync upgrade pi-auth test _host _apply _finish _deps

help:
	@printf '%s\n' \
	  'Files: use chezmoi diff, apply, verify, add, or re-add.' \
	  'make setup   Bootstrap Homebrew/chezmoi, sync, configure gh, and resolve Pi credentials.' \
	  'make sync    Apply files and reconcile dependencies without requesting upgrades.' \
	  'make upgrade Apply files and upgrade declared Homebrew and active mise tools.' \
	  'make pi-auth Resolve Pi credentials explicitly (requires 1Password).' \
	  'make test    Run isolated workflow/rendering and application tests.'

setup: _host
	./scripts/install-homebrew
	$(BREW_ENV) sh -c 'command -v chezmoi >/dev/null 2>&1 || brew install chezmoi'
	$(MAKE) sync
	$(BREW_ENV) mise exec -- gh config set git_protocol ssh --host github.com
	@if [ "$${NONINTERACTIVE:-}" = 1 ]; then \
		echo "Skipping Pi credential resolution in non-interactive setup; run make pi-auth later"; \
	else \
		$(MAKE) pi-auth; \
	fi

sync: _apply
	$(BREW_ENV) brew bundle install --no-upgrade --file="$(SOURCE_DIR)/Brewfile"
	$(BREW_ENV) mise install
	$(MAKE) _finish

upgrade: _apply
	$(BREW_ENV) brew update
	$(BREW_ENV) brew bundle install --upgrade --file="$(SOURCE_DIR)/Brewfile"
	$(BREW_ENV) mise upgrade
	$(MAKE) _finish

pi-auth: _host
	$(BREW_ENV) mise exec -- "$(HOME)/.local/bin/pi-auth-setup"

# Provisioning always targets this host. Alternate destinations are a chezmoi concern.
_host:
	@test -z "$(TARGET_DIR)" || { \
		printf '%s\n' 'TARGET_DIR is not supported for provisioning; use chezmoi --destination for file rendering.' >&2; \
		exit 2; \
	}

_apply: _host
	./scripts/configure-chezmoi-source "$(SOURCE_DIR)" $(BREW_ENV) chezmoi
	$(CHEZMOI) apply

# A final completion pass is required even when mise installed no new tools.
_finish: _host
	$(MAKE) _deps NPM='$(BREW_ENV) mise exec -- npm'
	$(BREW_ENV) mise exec -- misecompsync
	$(CHEZMOI) verify

# Checkout-local dependencies only; shared by provisioning and tests.
_deps:
	@set -e; for package in $(LOCAL_PACKAGES); do \
		$(NPM) ci --prefix "$(SOURCE_DIR)/packages/$$package"; \
	done

# Tests do not apply live dotfiles, install host tools, or resolve credentials.
test:
	python3 tests/workflow.test.py
	bash ./tests/chezmoi-source.test.sh
	./tests/platform-rendering.test.sh
	bun test tests/python-env.test.ts tests/herdr-projects.test.ts
	./tests/pi-auth-setup.test.sh
	./tests/pi-auth-setup-generation.test.sh
	$(MAKE) _deps
	@set -e; for package in $(LOCAL_PACKAGES); do \
		npm test --prefix "packages/$$package"; \
	done
	npm run typecheck --prefix packages/pi-tavily
