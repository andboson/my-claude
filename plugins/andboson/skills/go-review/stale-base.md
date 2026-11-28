# Stale base ref

The local default branch is behind, so `<base>..HEAD` lists unrelated commits.

1. Try `git merge-base --fork-point origin/<default-branch>`.
2. If that fails, use the parent of the branch's first commit, and say in the report that the ref was stale.

Reviewing an unrelated diff wastes the whole run: confirm `git log --oneline <base>..HEAD` shows only this branch's commits before reading any code.
