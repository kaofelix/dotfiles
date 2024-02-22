##################
## zplug config ##
##################
# Check if zplug is installed
if [[ ! -d ~/.zplug ]]; then
  git clone https://github.com/zplug/zplug ~/.zplug
  source ~/.zplug/init.zsh
fi

# Essential
source ~/.zplug/init.zsh

# Make sure to use double quotes to prevent shell expansion
zplug 'zplug/zplug', hook-build:'zplug --self-manage'
zplug "zsh-users/zsh-syntax-highlighting"

zplug "plugins/brew", from:oh-my-zsh
zplug "plugins/direnv", from:oh-my-zsh
zplug "plugins/emacs", from:oh-my-zsh
zplug "plugins/fzf", from:oh-my-zsh
zplug "plugins/git", from:oh-my-zsh
zplug "plugins/github", from:oh-my-zsh
zplug "plugins/golang", from:oh-my-zsh
zplug "plugins/virtualenvwrapper", from:oh-my-zsh
zplug "plugins/wd", from:oh-my-zsh
zplug "plugins/z", from:oh-my-zsh

zplug "lib/completion", from:oh-my-zsh
zplug "lib/clipboard", from:oh-my-zsh
zplug "lib/directories", from:oh-my-zsh

zplug "zsh-users/zsh-syntax-highlighting"

zplug "~/dotfiles/zsh/.oh-my-zsh/custom/themes", from:local, as:theme
zplug "~/.emacs.d/vterm.sh", from:local

# Install plugins if there are plugins that have not been installed
if ! zplug check --verbose; then
    printf "Install? [y/N]: "
    if read -q; then
        echo; zplug install
    fi
fi

zplug load

COMPLETION_WAITING_DOTS="true"
DISABLE_AUTO_TITLE="true"
export FZF_DEFAULT_OPTS='--layout=reverse'

fpath=($fpath ${HOMEBREW_PREFIX}/share/zsh/site-functions/)
fpath+=~/.zfunc

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

# bun completions
[ -s "/Users/kaofelix/.bun/_bun" ] && source "/Users/kaofelix/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
