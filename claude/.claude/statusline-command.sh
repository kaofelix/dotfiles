#!/bin/bash

# Read the JSON input
input=$(cat)

# Extract information from the JSON
current_dir=$(echo "$input" | jq -r '.workspace.current_dir' | sed "s|$HOME|~|g")
model=$(echo "$input" | jq -r '.model.display_name')

# Get git information (skip optional locks)
git_branch=$(git -C "$(echo "$input" | jq -r '.workspace.current_dir')" --no-optional-locks branch --show-current 2>/dev/null)

# Initialize git info
git_info=""

if [ -n "$git_branch" ]; then
    # Check for uncommitted changes (skip optional locks)
    git_status=$(git -C "$(echo "$input" | jq -r '.workspace.current_dir')" --no-optional-locks status --porcelain 2>/dev/null)

    if [ -n "$git_status" ]; then
        # Red indicator for dirty state
        git_status_indicator=" $(tput setaf 1)⨯$(tput sgr0)"
    else
        # Green indicator for clean state
        git_status_indicator=" $(tput setaf 2)●$(tput sgr0)"
    fi

    git_info=" $git_branch$git_status_indicator"
fi

# Use tput for colors instead of raw ANSI codes
cyan_color=$(tput setaf 6)
blue_color=$(tput setaf 4)
yellow_color=$(tput setaf 3)
reset_color=$(tput sgr0)

# Display the status line
printf "${cyan_color}[ ${yellow_color}%s${blue_color}%s${reset_color}" "$current_dir" "$git_info ${cyan_color}]"
