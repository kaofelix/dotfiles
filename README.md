# Kao Felix's Dotfiles

If I'm reading this, it means I'm in a new laptop and want to setup my
stuff. To be able to clone it properly (meaning, I'll want to change
it), I need to [add a new SSH key](https://github.com/settings/keys)
first.

I'm using macOS, so I need [brew](https://brew.sh) if I don't have it
yet.

I'll also need to install [oh-my-zsh](https://ohmyz.sh/#install).

The `Brewfile` contains machine-level tools and macOS applications,
while `mise` manages language runtimes and standalone development
tools. Set up everything with:

``` shell
make setup
```

`make setup` also resolves the 1Password-backed inference provider entries
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

It would also be a good idea to clone my [Emacs
config](https://github.com/kaofelix/kao-emacs-config) to `.emacs.d` to
have all the goodness.

``` shell
git clone git@github.com:kaofelix/kao-emacs-config.git
```

To update everything later:

``` shell
make update
```

Now I'm home again.
