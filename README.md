# my-claude

My Claude Code mods.

| Mod | What it does |
| --- | --- |
| [session-mod](mods/session-mod) | Docked pane with live session stats, the branch's pull request and system load |

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
git clone git@github.com:andboson/my-claude.git
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
