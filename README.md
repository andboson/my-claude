# my-claude

My Claude Code mods and skills.

| Plugin | What it does |
| --- | --- |
| [session-mod](mods/session-mod) | Docked pane with live session stats, the branch's pull request and system load |
| [andboson](plugins/andboson/skills) | Go conventions, a Go code review, comment cleanup, and branches, commits and pull requests |

## Skills

| Skill | What it does |
| --- | --- |
| `/andboson:clean-comments` | Cleans up comments in existing Go code, saving decisions to ADRs and drafting issues. Reports before editing |
| `/andboson:go-conventions` | Rules for writing and testing Go, matched to the Go version in `go.mod` |
| `/andboson:go-review` | Reviews a diff, branch or PR in a forked subagent. Takes a base ref or PR number |
| `/andboson:pr` | Creates branches, commits and pull requests, and writes PR descriptions |

Needs `git`. PR work needs `gh` signed in; Go work needs the Go toolchain, and `golangci-lint` for the lint step. The review's mutation probe asks for permission to run commands; if denied, it is skipped.

```bash
claude plugin install andboson --marketplace andboson/my-claude
```

`pr` includes adapted work: see its [credits](plugins/andboson/skills/pr/CREDITS.md). `clean-comments` was created from a post by Matt Pocock: see its [credits](plugins/andboson/skills/clean-comments/CREDITS.md).

The sections below, up to **Develop**, are about the mod.

## Requirements

- A Claude Code build that supports mods (hooks modules). Tested on 2.1.330.
- Optional: `gh` signed in, for the Pull request section.
- Optional: Linux, for the System section (it reads `/proc`).

## Add the mod

Pick **one** way. Loading the mod twice registers its hooks twice.

### Install from GitHub

At the prompt of a terminal session, then answer `y` and choose a scope:

```
/plugin install session-mod --marketplace andboson/my-claude
```

Or from a shell:

```bash
claude plugin install session-mod --marketplace andboson/my-claude
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `andboson/my-claude`, then **Add plugin**.

### Install from a local clone (to edit it)

```bash
git clone https://github.com/andboson/my-claude.git
```

```bash
claude plugin marketplace add ./my-claude
```

```bash
claude plugin install session-mod@my-claude
```

The mod is read from the clone: after an edit, run `/reload-plugins`.

### Try it without installing

Loads the mod for one session only:

```bash
claude --plugin-dir ./my-claude/mods/session-mod
```

For sessions where you can't pass a flag (such as the desktop app), put the absolute path in `~/.claude/settings.json` and start a new session:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/absolute/path/to/my-claude/mods/session-mod"
  }
}
```

## Run it

1. Start a session: `claude`.
2. Send a prompt. The **Session stats** pane opens (on terminals 144+ columns wide it opens at session start).
3. If you close it, type `/session-mod` to open it again.

See the [mod's README](mods/session-mod/README.md) for what each section shows.

## Develop

From the repository root:

```bash
claude plugin validate mods/session-mod
```

```bash
claude plugin test mods/session-mod
```

```bash
claude plugin validate plugins/andboson
```
