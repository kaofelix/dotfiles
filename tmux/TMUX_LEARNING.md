# Tmux Quick Reference Guide

## Config Notes

Your config includes these sensible improvements:
- **History: 50,000 lines** (instead of default 2,000)
- **Truecolor support** for better colors
- **Focus events** so editors detect pane focus
- **New windows/panes in current directory** (not home)
- **Prefix: C-l** (Ctrl + l) - comfortable for emacs users

## Learning Strategy

**For the next 1-2 months:**
- ✅ Use tmux windows instead of terminal tabs
- ✅ Enable auto-start tmux in your shell
- ✅ Ditch Ghostty tabs - let tmux handle windows

**Why this works:**
- Forces you to learn tmux's window management
- tmux windows = tabs (but with detach/reattach!)
- tmux panes = splits within windows
- You can't "cheat" with tabs, so you learn faster

**To get a plain terminal (when needed):**
```bash
TMUX_AUTO_START=false zsh
```

## Essential Commands (Terminal)

```bash
tmux                          # Start new session
tmux attach -t name           # Attach to session 'name'
tmux new -s name              # Create named session
tmux ls                       # List sessions
tmux kill-session -t name     # Delete session
```

## Keybinding Cheat Sheet (Inside Tmux)

**Quick Reference:** Press `C-l ?` to see a categorized cheat sheet anytime!

**Prefix key: `C-l` (Ctrl + l)** - Press this before all tmux commands

### Sessions (Workspaces)
| Binding | Action |
|---------|--------|
| `C-l s` | List sessions |
| `C-l $` | Rename current session |
| `C-l (` | Previous session |
| `C-l )` | Next session |
| `C-l d` | Detach from session |

### Windows (Tabs)
| Binding | Action |
|---------|--------|
| `C-l c` | Create new window |
| `C-l ,` | Rename window |
| `C-l &` | Kill window |
| `C-l n` | Next window |
| `C-l p` | Previous window |
| `C-l 1-9` | Go to window number |
| `C-l w` | Show window list |

### Panes (Split Windows)
| Binding | Action |
|---------|--------|
| `C-l |` | Split vertically (left/right) |
| `C-l -` | Split horizontally (top/bottom) |
| `C-l Arrow` | Move between panes |
| `C-l o` | Rotate panes |
| `C-l x` | Kill pane |
| `C-l z` | Zoom pane (toggle fullscreen) |
| `C-l {` | Swap pane with previous |
| `C-l }` | Swap pane with next |

### Copy Mode (Scroll/Search)
| Binding | Action |
|---------|--------|
| `C-l [` | Enter copy mode |
| `C-q` (in copy mode) | Exit copy mode |
| `C-n` / `C-p` | Line down/up (emacs-style) |
| `C-v` / `M-v` | Page down/up |
| `C-s` | Search forward |
| `Enter` / `M-w` | Copy selection |
| `C-l ]` | Paste from copy buffer |

### Other Useful
| Binding | Action |
|---------|--------|
| `C-l ?` | List all keybindings |
| `C-l :` | Command prompt |
| `C-l r` | Reload config |
| `C-l `` (backtick) | Toggle broadcast to all panes |

## Learning Progression

### Week 1: Orientation
- [ ] Start with `tmux`
- [ ] Press `C-l ?` to see all bindings
- [ ] Practice creating windows (`C-l c`)
- [ ] Practice moving between windows (`C-l n`, `C-l p`)
- [ ] Practice detaching (`C-l d`) and re-attaching (`tmux attach`)
- **Keep mouse ON**

### Week 2: Panes
- [ ] Split windows (`C-l |`, `C-l -`)
- [ ] Navigate panes (`C-l Arrow keys`)
- [ ] Kill panes (`C-l x`)
- [ ] Zoom panes (`C-l z`)
- **Keep mouse ON**

### Week 3: Copy Mode
- [ ] Enter copy mode (`C-l [`)
- [ ] Navigate with emacs keys (`C-n`, `C-p`, `C-v`)
- [ ] Search (`C-s`)
- [ ] Copy text (`M-w`)
- [ ] Paste (`C-l ]`)
- **Try turning mouse OFF**

### Week 4: Sessions
- [ ] Create named sessions (`tmux new -s project`)
- [ ] List sessions (`tmux ls`)
- [ ] Switch between sessions (`C-l s`, `C-l (`, `C-l )`)
- [ ] Use different sessions for different projects
- **Mouse OFF**

### After Week 4: Customize
- Based on YOUR actual workflow
- Add shortcuts you find yourself using often
- Consider project-specific configs

## Quick Reference Card

```
┌─────────────────────────────────────────────────┐
│  Tmux Prefix: C-l                                │
├─────────────────────────────────────────────────┤
│  Sessions: s, $, (, ), d                         │
│  Windows: c, ,, &, n, p, 1-9, w                  │
│  Panes: |, -, Arrows, o, x, z, {, }              │
│  Copy: [, Enter, ], C-q to exit                  │
│  Help: ?                                         │
│  Reload: r                                        │
└─────────────────────────────────────────────────┘
```

## Resources

- **Official:** https://github.com/tmux/tmux/wiki
- **Cheatsheet:** https://tmuxcheatsheet.com/
- **Manual:** `man tmux`
- **Interactive:** In tmux, press `C-l :` then type `list-keys`

## Common Pitfalls

1. **Forgetting the prefix** - Press `C-l` before other commands!
2. **Confusing panes vs windows** - Windows = tabs, Panes = splits
3. **Not detaching** - Use `C-l d` instead of closing terminal
4. **Mouse dependency** - Turn it off once you know keybindings
5. **Copy mode confusion** - Press `C-q` to exit if stuck

## Pro Tips

- Use `C-l r` often while learning - reloads config instantly
- Create sessions per project: `tmux new -s work`, `tmux new -s personal`
- Use `C-l `` to run commands in multiple panes at once
- Zoom a pane (`C-l z`) to focus, then zoom out to see context
- Rename windows (`C-l ,`) to remember what's in each
