DOTFILES_DIR=$(dirname $(readlink -f "${(%):-%N}"))

source "${HOME}/.zgenom/zgenom.zsh"
zgenom autoupdate

if ! zgenom saved; then
    echo "Creating a zgenom save"

    # Ohmyzsh base library
    zgenom ohmyzsh

    # plugins
    zgenom ohmyzsh plugins/aliases
    zgenom ohmyzsh plugins/brew
    zgenom ohmyzsh plugins/direnv
    zgenom ohmyzsh plugins/docker-compose
    zgenom ohmyzsh plugins/fzf
    zgenom ohmyzsh plugins/git
    zgenom ohmyzsh plugins/github
    zgenom ohmyzsh plugins/golang
    zgenom ohmyzsh plugins/wd
    zgenom ohmyzsh plugins/z
    [[ "$(uname -s)" = Darwin ]] && zgenom ohmyzsh plugins/macos

    zgenom load zdharma-continuum/fast-syntax-highlighting
    zgenom load "${HOME}/.emacs.d/vterm.sh"

    zgenom load ${HOMEBREW_PREFIX}/share/zsh/site-functions/ --completion
    zgenom load ${HOME}/.zfunc --completion
    zgenom load ${HOME}/.local/share/zsh/site-functions --completion

    # completions
    zgenom load zsh-users/zsh-completions

    # save all to init script
    zgenom save

    # Compile your zsh files
    zgenom compile "$HOME/.zshrc"

    # You can perform other "time consuming" maintenance tasks here as well.
    # If you use `zgenom autoupdate` you're making sure it gets
    # executed every 7 days.
fi

eval "$(starship init zsh)"
setopt promptsubst

autoload -U edit-command-line
zle -N edit-command-line
bindkey '^X^E' edit-command-line  # Ctrl+X Ctrl+E

COMPLETION_WAITING_DOTS="true"
DISABLE_AUTO_TITLE="true"
export FZF_DEFAULT_OPTS='--layout=reverse'

##################
## Shell Config ##
##################

# zsh options
setopt SHARE_HISTORY

# env vars
export LANG=en_US.UTF-8
export CLICOLOR=True
export PAGER='less'
export LESS='FSRX'
export EDITOR="emacsclient"
export ALTERNATE_EDITOR="emacs"

##################################
## Custom functions and aliases ##
##################################
alias e='emacsclient -n'
alias ec='emacsclient'
alias _r='. ~/.zshrc'
alias la='ls -a'
alias cat='bat --paging=never'
unalias gob

alias va='. .venv/bin/activate'

_clow() {
    crush run "$*" | glow
}
alias clow='noglob _clow'

if [ -f "$HOME/.zshrc.local" ]; then
    source "$HOME/.zshrc.local"
fi
