DOTFILES_DIR=$(dirname $(readlink -f "${(%):-%N}"))

### Added by Zinit's installer
if [[ ! -f $HOME/.local/share/zinit/zinit.git/zinit.zsh ]]; then
    print -P "%F{33} %F{220}Installing %F{33}ZDHARMA-CONTINUUM%F{220} Initiative Plugin Manager (%F{33}zdharma-continuum/zinit%F{220})…%f"
    command mkdir -p "$HOME/.local/share/zinit" && command chmod g-rwX "$HOME/.local/share/zinit"
    command git clone https://github.com/zdharma-continuum/zinit "$HOME/.local/share/zinit/zinit.git" && \
        print -P "%F{33} %F{34}Installation successful.%f%b" || \
        print -P "%F{160} The clone has failed.%f%b"
fi

source "$HOME/.local/share/zinit/zinit.git/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

# Load a few important annexes, without Turbo
# (this is currently required for annexes)
# zi light-mode for \
#     zdharma-continuum/zinit-annex-as-monitor \
#     zdharma-continuum/zinit-annex-bin-gem-node \
#     zdharma-continuum/zinit-annex-patch-dl \
#     zdharma-continuum/zinit-annex-rust

### End of Zinit's installer chunk
ZSH_THEME="honukai"

zi pack"default+keys" for fzf

zi light zdharma-continuum/fast-syntax-highlighting
zi light agkozak/zsh-z

zi snippet OMZL::clipboard.zsh
zi snippet OMZL::completion.zsh
zi snippet OMZL::directories.zsh
zi snippet OMZL::git.zsh

zi snippet OMZP::aliases
zi snippet OMZP::bun
zi snippet OMZP::brew
zi snippet OMZP::direnv
zi snippet OMZP::docker-compose
zi snippet OMZP::emacs
zi snippet OMZP::git
zi snippet OMZP::github
zi snippet OMZP::golang
zi snippet OMZP::virtualenvwrapper
zi snippet OMZP::wd
zi snippet "${HOME}/.emacs.d/vterm.sh"

setopt promptsubst
zi snippet "${DOTFILES_DIR}/.oh-my-zsh/custom/themes/honukai.zsh-theme"

COMPLETION_WAITING_DOTS="true"
DISABLE_AUTO_TITLE="true"
export FZF_DEFAULT_OPTS='--layout=reverse'

fpath=($fpath ${HOMEBREW_PREFIX}/share/zsh/site-functions/)
fpath+=~/.zfunc

autoload -Uz compinit
compinit

zinit cdreplay -q

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
alias _r='. ~/.zshrc'
alias la='ls -a'
alias cat='bat --paging=never'

alias va='. .venv/bin/activate'

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

