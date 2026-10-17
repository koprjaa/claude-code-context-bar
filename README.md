# claude-code-context-bar

Context window usage bar for the Claude Code prompt footer.

A Claude Code plugin (`context-pane`). The bar sits at the right end of the prompt footer, next to the permission mode. Hover it for the breakdown in tokens and percent.

![Footer bar with the breakdown open](docs/screenshot.png)

## What it does

- Fills to the live figure, the same one the status line uses.
- Colours the used part by category: messages, system tools, MCP, memory, skills, agents, system prompt.
- Counts tool results in `Messages`, which the built-in breakdown leaves out ([#94436](https://github.com/anthropics/claude-code/issues/94436)).
- Estimates locally, with no extra API calls, and refreshes after every turn.
- Adds a `/context-pane` command that opens the breakdown as a side pane.

## Install

In a terminal session:

```
/plugin install context-pane --marketplace koprjaa/claude-code-context-bar
```

From a shell:

```
claude plugin install context-pane --marketplace koprjaa/claude-code-context-bar
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `koprjaa/claude-code-context-bar`, then Add plugin.

## Use

The bar shows up in the footer after install. Run `/context-pane` for the side pane.

With `"tui": "fullscreen"` the breakdown floats over the transcript. Without it, the breakdown should open in the band above the prompt, but Claude Code does not draw it there yet. The footer bar works in both modes.
