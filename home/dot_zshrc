typeset -U path PATH fpath FPATH

COMPLETION_WAITING_DOTS="true"
DISABLE_AUTO_TITLE="true"
export FZF_DEFAULT_OPTS='--layout=reverse'

ZGEN_RESET_ON_CHANGE=("$HOME/.zshrc")

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
    zgenom ohmyzsh --completion plugins/golang
    zgenom ohmyzsh plugins/wd
    zgenom ohmyzsh plugins/z
    [[ "$(uname -s)" = Darwin ]] && zgenom ohmyzsh plugins/macos

    zgenom load "${HOME}/.emacs.d/vterm.sh"

    # completions
    zgenom load "${HOMEBREW_PREFIX}/share/zsh/site-functions" --completion
    zgenom load "${HOME}/.zfunc" --completion
    zgenom load zsh-users/zsh-completions
    zgenom load "${HOME}/.local/share/zsh/site-functions" --completion

    # Syntax highlighting should be loaded last
    zgenom load zdharma-continuum/fast-syntax-highlighting

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

## Set tmux pane title to current working directory (smartly shortened)
precmd_tmux_title() {
    if [[ -n $TMUX ]]; then
        local dir="${PWD/#$HOME/~}"
        local max_len=35

        if [[ ${#dir} -gt $max_len && "$dir" == */* ]]; then
            # Keep first segment and last 1-2 segments
            local first="${dir%%/*}"
            local last="${dir##*/}"
            local parent="${dir%/*}"
            parent="${parent##*/}"

            # Try ~/parent/last first, then ~/.../parent/last
            local short="${first}/.../${parent}/${last}"
            if [[ ${#short} -gt $max_len ]]; then
                short="${first}/.../${last}"
            fi
            dir="$short"
        fi

        command tmux select-pane -T "$dir" 2>/dev/null
    fi
}
autoload -Uz add-zsh-hook
add-zsh-hook precmd precmd_tmux_title

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
export SSH_AUTH_SOCK="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"

##################################
## Custom functions and aliases ##
##################################
alias e='emacsclient -n'
alias ec='emacsclient'
alias _r='exec zsh'
alias la='ls -a'
alias cat='bat --paging=never'

alias va='. .venv/bin/activate'

upi() {
    cd ~/Code/pi-mono/
    git pull
    npm install
    npm run build
    git restore packages/ai/src/models.generated.ts
    cd -
}

alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

_ask() {
    pi -p --provider deepseek --model deepseek-v4-flash  "$*" | glow
}
alias ask='noglob _ask'

if [ -f "$HOME/.zshrc.local" ]; then
    source "$HOME/.zshrc.local"
fi

eval "$(mise activate zsh)"
