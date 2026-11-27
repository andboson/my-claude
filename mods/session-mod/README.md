# session-mod

A docked pane for Claude Code showing live stats for the current session.

<img width="300" height="450" alt="Screenshot from 2026-11-26 11-38-27" src="https://github.com/user-attachments/assets/c78b0940-876e-4540-b5e3-d706a4e02a5a" />


## What it shows

| Section | Contents |
| --- | --- |
| Top | Session time (`live` while Claude works, `idle` otherwise), prompts, agents spawned |
| Context | Fill bar (green, yellow at 60%, red at 85%), tokens used / window, session cost |
| Tools | Total tool calls, how many are running, per-tool counts |
| Pull request | The branch's PR as a clickable `#123` link, open/draft/merged, approvals (`✓ 2 approved`, bots not counted, `✗ changes requested`, `○ awaiting review`) and CI state. Needs `gh` signed in; hidden when the branch has no PR; merged and closed PRs still show. Refreshed every 30 s and after each turn |
| Feedback | Under the PR when reviewers (bots like Copilot and Claude included) requested changes or review threads are unresolved: `✗ 1 changes requested · 2 unresolved` and an `[Address]` button that asks Claude to work through them |
| System | CPU bar, load average, memory. Read at session start, every 30 s while idle and every 2 s while Claude is working |

A toast warns once when the context reaches 85% and re-arms after it drops below 70%.

## Use

- The pane opens on your first prompt (so it seats at any terminal width), and at session start on terminals 144+ columns wide.
- `/session-mod` opens it again after you close it.
- It opens at the default dock share and scales with the terminal; a pane you resized yourself keeps your size.

## Install

See [how to add and run it](../../README.md#add-the-mod).

## Notes

- The System section reads `/proc`, so it is Linux only. Elsewhere it stays hidden and the rest works.
- Counts live in the session and start fresh with each session.

## Develop

```
claude plugin validate .
claude plugin test .
```

## License

MIT, see [LICENSE](LICENSE).
