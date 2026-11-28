---
name: clean-comments
description: Cleans up Go code comments in existing code by category, moving real decisions into ADRs and drafting issues for comments that excuse weak code. Use when asked to delete, clean up, or reduce comments in Go code.
metadata:
  credits:
    - source: a post on X (Twitter)
      author: Matt Pocock
      organisation: AI Hero
---

# Clean up Go comments

The repo's `AGENTS.md` / `CLAUDE.md`, if it has one, wins over this skill. `go-conventions` (`andboson:go-conventions` when installed as a plugin) says what a good comment is.

**Scope:** the files or packages the user names; if none, ask. Skip tests and generated files. Covers comments inside function bodies, and end-of-line comments anywhere, including `const`, `var` and `struct` blocks. Keep doc comments on declarations and directives (`//nolint`, `//go:`). Rewrite a stale doc comment to match the code.

## Categorise every comment in scope, plus stale doc comments

- **Keep**: a short *why* or warning the code can't show. When unsure, keep.
- **Tautology**: repeats what the code already shows. Delete.
- **Stale**: no longer matches the code. Delete, or rewrite a doc comment. If the code may be the wrong side, report it and keep the comment.
- **Excuse**: justifies a weak implementation ("for now", "unlikely", `TODO`). Draft an issue (Why / How / Acceptance). The comment stays until the change that fixes the issue removes it. Don't file the issue or create a drafts file unless the user says where.
- **Decision**: a non-obvious decision too big for one line. Move it into an ADR in the repo's ADR folder, following its numbering and format (Status, Context, Decision, Consequences if it has none); ask before creating the first one. Write only what the comment and the code show, and mark it "reconstructed from code comments, to be confirmed by the team". Delete the comment once the ADR exists.

## Order of work

1. Report first: each comment as file:line, category and a one-line reason (plus the new text for a rewrite), the issue drafts, and counts. Wait for the go-ahead before editing.
2. Edit with the code line as context, because the same comment text can repeat in a file. If you script it, match line number and exact text, work from the bottom of each file up, and report every mismatch.
3. Verify:
   - `gofmt -w` on the edited files only. A repo-wide format target can rewrite unrelated files.
   - The repo's build, lint and test commands. Report other findings in touched files, but don't fix them here.
   - `git diff` shows only comment changes and the re-alignment `gofmt` made.

Leave everything uncommitted. Don't revert changes you didn't make.
