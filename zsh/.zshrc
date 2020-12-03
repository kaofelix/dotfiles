######################
## oh-my-zsh config ##
######################
# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh
ZSH_THEME="honukai"
COMPLETION_WAITING_DOTS="true"
DISABLE_AUTO_TITLE="true"
export FZF_DEFAULT_OPTS='--layout=reverse'

plugins=(
    direnv
    fasd
    fzf
    git
    github
    golang
    wd
    brew
)

fpath=($fpath /usr/local/share/zsh/site-functions/)
fpath+=~/.zfunc
source $ZSH/oh-my-zsh.sh

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
source /usr/local/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

source ~/.emacs.d/vterm.sh
