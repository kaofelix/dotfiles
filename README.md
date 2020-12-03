# Kao Felix's Dotfiles

If I'm reading this, it means I'm in a new laptop and want to setup my
stuff. To be able to clone it properly (meaning, I'll want to change
it), I need to [add a new SSH key](https://github.com/settings/keys)
first.

I'm using macOS, so I need [brew](https://brew.sh) if I don't have it
yet.

I'll also need to install [oh-my-zsh](https://ohmyz.sh/#install).

There's a `Brewfile` with a handy list of tools that I use. I can run

``` shell
brew bundle install
```

to add everything in one go (including Emacs). After that, it would be
a good idea to clone my [Emacs
config](https://github.com/kaofelix/kao-emacs-config) to `.emacs.d` to
have all the goodness.

``` shell
git clone git@github.com:kaofelix/kao-emacs-config.git
```

Then I can `stow`my zsh stuff to it's proper place

``` shell
stow zsh -t ~/
```

Now I'm home again.
