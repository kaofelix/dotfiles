# Kao Felix's Dotfiles

If I'm reading this, it means I'm in a new laptop and want to setup my
stuff. To be able to clone it properly (meaning, I'll want to change
it), I need to [add a new SSH key](https://github.com/settings/keys)
first.

The setup supports macOS and Linux using [Homebrew](https://brew.sh) and
GNU Stow. `make setup` bootstraps Homebrew with its official installer if
needed. An existing `brew` on `PATH` is preferred; standard installation
paths are only discovery fallbacks. The actual environment comes from
`brew shellenv`, saved to `~/.config/homebrew/shellenv.sh` (or
`$XDG_CONFIG_HOME/homebrew/shellenv.sh`) and loaded by setup and Zsh.

Prerequisites: `make`, Bash, curl, Git, and permission to install Homebrew
(sudo on a fresh Linux machine). On Ubuntu/Debian:

``` shell
sudo apt-get update
sudo apt-get install -y build-essential procps curl file git
make setup
```

For unattended machines with passwordless sudo, use `NONINTERACTIVE=1 make setup`.
On macOS, the Homebrew installer may also request Xcode Command Line Tools.
Setup does not change your login shell; run `zsh` afterward, or use `chsh`
with an administrator-approved Zsh path if you want it as your default.
Stow refuses conflicting files rather than overwriting them: back up and move
existing dotfiles before retrying. `make adopt PACKAGE=...` explicitly copies
a package's existing home files into this repository; review those changes.

`make setup` installs [zgenom](https://github.com/jandamm/zgenom) to
`~/.zgenom` before stowing the shell config. Zgenom loads Oh My Zsh and the
configured plugins on first shell startup; no separate Oh My Zsh install
is needed. To install just the plugin manager, run `make zgenom`.

The `Brewfile` contains cross-platform machine-level tools, while `mise`
manages language runtimes and standalone development tools. Setup explicitly
trusts this repository's mise configuration (including its postinstall hook),
installs its tools and pifind dependencies, and generates shell completions.
Set up the shared configuration with:

``` shell
make setup
```

### Optional macOS applications and authentication

On macOS, invoke `make setup-macos` after setup to install `Brewfile.macos`
(casks, fonts, Emacs, and the 1Password CLI). Linux never installs these casks,
native keybindings, macOS Git signing configuration, or the Dash MCP server.
The `macos` Stow package supplies the signing include and Dash's shared MCP
configuration on macOS. Linux installs terminal Emacs from the shared Brewfile.
GUI applications still require a desktop; a headless Linux machine does not
provide one. Glimpse's optional Linux native renderer additionally needs GTK4 and
WebKitGTK development packages and a native build (see Glimpse's installation
guide); its headless-safe Pi extensions do not require that renderer.
Remote MCP integrations retain their own login requirements. Authenticate them
with `/mcp-auth` when needed; missing MCP OAuth does not block DeepSeek usage.

Invoke `make pi-auth` separately after installing and signing in to the
1Password CLI. Neither this step nor 1Password is required by `make setup`.
It resolves the 1Password-backed inference provider entries
from `~/.pi/agent/auth.op.json` and merges their keys into Pi's ignored local
`auth.json`, preserving Pi-managed OAuth credentials. Pi then reads the local
keys directly at startup instead of invoking 1Password for each provider.
The generated file contains plaintext secrets, is written with mode `0600`,
and should not be committed.

Regenerate it after rotating a key with `make pi-auth`. To verify the secret
references without changing `auth.json` or printing their values, run:

``` shell
pi-auth-setup --check
```

When more than one 1Password account is configured, set `OP_ACCOUNT` once
in the ignored `~/.zshrc.local` file. The tracked auth references then stay
account-independent:

``` shell
export OP_ACCOUNT="<account ID or shorthand>"
```

### Pi with direnv (no 1Password required)

Pi reads `DEEPSEEK_API_KEY` directly from its environment. In a private working
directory, copy your credential-bearing `~/.envrc.example` to `.envrc`, review
it, then authorize direnv:

``` shell
mkdir -p ~/pi-smoke
chmod 700 ~/pi-smoke
cd ~/pi-smoke
install -m 600 ~/.envrc.example .envrc
direnv allow
direnv exec . mise exec -- pi --provider deepseek --model deepseek-v4-flash -p 'Reply with SETUP_OK'
```

Keep credentials scoped to this dedicated directory, not `~/.envrc` or global
shell exports: child processes in unrelated projects would inherit them.
Only include the keys needed here. This limits accidental exposure, not access
by malicious programs running as your user.

Do not commit or print either credential file; keep the source file mode 0600
too. `.envrc` files are ignored by this repository, but other repositories need
their own ignore rules. Zsh loads direnv automatically; explicit `direnv exec` is
useful for non-interactive commands. Pi's tracked startup model remains
unchanged; select DeepSeek with the flags above or save it with `/model`.
Pi installs its configured packages on first launch. Credentials already in
Pi's local `auth.json` take precedence over environment credentials.

### Git and editor prerequisites

Git signing stays enabled. On macOS it uses 1Password's signing application;
on Linux it uses OpenSSH and preserves the inherited `SSH_AUTH_SOCK`. Configure
your signing key/agent before committing. Per-machine overrides belong in
`~/.gitconfig.local`, for example:

``` shell
git config --file ~/.gitconfig.local user.signingkey ~/.ssh/id_ed25519.pub
```

Setup does not copy private SSH keys.

It would also be a good idea to clone my [Emacs
config](https://github.com/kaofelix/kao-emacs-config) to `.emacs.d` to
have all the goodness.

``` shell
git clone git@github.com:kaofelix/kao-emacs-config.git
```

Agent skills live in `agents/.agents/skills/` and are stowed to the
cross-agent standard location at `~/.agents/skills/`.

Native macOS text bindings live in
`keybindings/Library/KeyBindings/DefaultKeyBinding.dict`. Run `make keybindings`
(also included in `make setup`) and restart applications to load them. No
administrator privileges, driver, or Accessibility permission is required.

These extend the built-in Emacs bindings, using Option as Meta:

| Shortcut | Action |
| --- | --- |
| Control-Option-H | Delete previous word |
| Control-Option-D | Delete next word |
| Option-B / Option-F | Move backward / forward one word |

They apply in apps using the native macOS text-binding system, not universally;
terminals and custom editors may need app-specific bindings. Caps Lock can be
mapped to Control separately in System Settings → Keyboard → Keyboard Shortcuts
→ Modifier Keys.

To update everything later:

``` shell
make update
```

### Validation

After setup, run `make check` for bootstrap/auth regression tests, pifind tests,
and the existing secret-scanning hook. Run `make smoke` in the installed home
for tool, Stow, Git and isolated tmux checks (no inference credentials needed).
The optional macOS application step intentionally rejects Linux.

Now I'm home again.
