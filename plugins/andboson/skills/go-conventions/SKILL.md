---
name: go-conventions
description: Go conventions — lint-clean code, gomock tests, sentinel errors, modern syntax for the go.mod version. Use when writing, reviewing, refactoring, or testing any *.go file.
allowed-tools: Bash(grep -h '^go ' *), Bash(git rev-parse --show-toplevel), Bash(echo "unknown, check go.mod")
---

# Go conventions

The repo's `AGENTS.md` / `CLAUDE.md`, if it has one, takes precedence over this skill for architecture and anything it states.

Target Go version: !`grep -h '^go ' "$(git rev-parse --show-toplevel 2>/dev/null)/go.mod" 2>/dev/null || echo "unknown, check go.mod"`. Use every feature up to that version (see the table at the bottom).

## Done

A Go change is done when all four steps are clean, in order. Prefer the repo's own commands: its `CLAUDE.md` / `AGENTS.md` / `Makefile` (`make help`) say which targets exist. Targets differ per repo, so check before running one. The plain command in brackets is the fallback.

1. **Generate** (`make generate` or `go generate ./...`): run it if you touched an interface, a `//go:generate` line, or generated sources such as sqlc queries.
2. **Format and lint**: if the Makefile has an aggregate target (such as `check`) that formats and lints, use it. Otherwise run the format target then the lint target (`make fmt` then `make lint`, or `gofumpt -w . && goimports -w .` then `golangci-lint run ./...`). Fix every finding, including ones already in the files you touched. Run the linter with the build tags the repo's `.golangci.yaml` sets, so tagged files (for example integration tests) are linted too.
3. **Test** (`make test` or `go test -race ./...`). Also run the tagged tests (for example `//go:build integration`) whenever the diff changes tagged tests or changes behaviour they cover: persistence, repositories, handlers. Prefer the narrow target (one package), and run the full tagged suite before the PR. Tests you did not edit go stale when behaviour moves, so state which target you ran.
4. **Review** before any commit: if the `go-review` skill is available (`andboson:go-review` when installed as a plugin), invoke it. Fix every `blocker` and `major` finding, re-run steps 2–3, and invoke the review again until no `blocker` or `major` remains. Show the user any `minor` or `nit` findings you didn't fix. If the skill isn't available, skip this step. Don't loop forever: after the third review round, stop, describe the remaining problem, and ask the user what to do.

## Linter limits

Repos using this skill run golangci-lint with most linters enabled. Read `.golangci.yaml` for the exact limits. The usual ones:

- **Sentinel errors** (`err113`): declare them in a package-level `var (...)` block (`ErrXxx = errors.New("...")`) and wrap them at the call site: `fmt.Errorf("%w: order %s", ErrInvalidOrder, id)`.
- **Parameter count** (`revive` argument-limit, usually 4): pass a params struct when you need more.
- **Complexity** (`cyclop`, usually 9): extract named helpers, or a map or switch lookup.
- **Order** (`funcorder`): constructor, then exported methods, then unexported ones.
- **Whitespace** (`nlreturn`, `wsl_v5`): put a blank line before every `return`, `break`, and `continue`, unless the block is only that statement.
- **Wrapping** (`errorlint`, `wrapcheck`): wrap with `%w`, and give each wrap a lowercase context with no trailing punctuation.

## Start with tests

When the task has a spec, ticket, or acceptance criteria, write the tests first (TDD): one failing test per criterion, run it and see it fail for the right reason, then write the code to make it pass. If a criterion is unclear, ambiguous, or contradicts another, ask the user before writing the test. Don't guess. Skip test-first for pure refactors (existing tests cover them) and for trivial changes with no behaviour.

## Writing code

- **Errors**: use the stdlib only: `fmt.Errorf("...: %w", err)`, `errors.New`, `errors.Is`/`errors.As`/`errors.Join`. Never import `github.com/pkg/errors` in new or edited code, even if sibling files do; when you edit a file that uses it, switch that file to the stdlib.
- **Comments**: let names and structure explain *what* the code does, and comment only the *why* a reader can't see: a business rule, a workaround, a non-obvious constraint. Keep each comment to one line. Exported symbols get a one-line doc comment that starts with the symbol's name (`revive` exported) and ends with a period (`godot`). Comments describe the code as it stands, not how it changed, and they never restate the line below them.
- **Interfaces**: define them in the consumer package, keep them to 1–3 methods, and generate their mocks next to the definition: `//go:generate mockgen -source=$GOFILE -destination=<mocks dir>/mock_<pkg>/mock_$GOFILE`. Copy the destination pattern from an existing `//go:generate` line in the repo. Don't add an interface until a consumer needs one.
- **Enums**: typed constants plus `//go:generate stringer -type=X -trimprefix=X`.
- **SQL**: if the repo uses sqlc, edit the `.sql` query files and regenerate rather than writing SQL strings in Go. Use the repo's transaction helper for multi-step writes.
- **Postgres concurrency**: services run several replicas, so two copies of the same consumer or cron job can touch the same rows.
  - If you read rows and then update them, lock them with `SELECT … FOR UPDATE` inside the transaction, or `FOR UPDATE SKIP LOCKED` for queue-like batch claims. Without the lock, two replicas update the same rows and one write is lost.
  - Retry the whole transaction on SQLSTATE `40001` (serialization failure) and `40P01` (deadlock).
  - Map `23505` (unique violation) to a domain sentinel error rather than a generic failure.
- **Work that must outlive cancellation**: on shutdown or request cancel, run the steps that have to finish on `context.WithoutCancel(ctx)` (Go 1.21+). These are acking or deleting the queue message (SQS, Pub/Sub, etc.), writing the final status row, and writing the audit record. On the cancelled ctx they fail, and the message is redelivered and processed twice. Give that context its own `context.WithTimeout`.
- **Goroutines**:
  - If any goroutine can fail, needs to stop when the others fail, or needs a concurrency cap, use `errgroup.WithContext` (`golang.org/x/sync/errgroup`): `g.Go(...)`, `g.SetLimit(n)`, `return g.Wait()`. Don't hand-build a worker pool.
  - If the goroutines can't fail, use `wg.Go` (Go 1.25+).
  - Every goroutine needs a stated exit: check `ctx.Done()` in every blocking `select`.
- **Errors, handle once**: log an error or return it, never both. Return early on errors and keep the happy path unindented.
- **Naming**: no package stutter (`order.OrderService` → `order.Service`) and no `Get` prefix on getters.
- **Zero value**: make the zero value of a type usable where you can, so callers don't need a constructor just to avoid a nil panic.
- **Generated files** (`mocks/`, `*_string.go`, sqlc output): regenerate them; never edit them by hand.

## Writing tests

- Name: `Test_functionName_scenario`.
- Shape:
  - **Table-driven tests** for simple functions, where only the inputs and expected outputs change between cases: pure functions, parsers, validators, mappers.
  - **Separate `t.Run` subtests** for more involved logic, where each case needs its own mock expectations, setup, or sequence of steps. Each subtest reads top to bottom with its own arrange/act/assert. Don't squeeze that into table fields full of setup funcs and `if` flags.
- Mocks: `go.uber.org/mock/gomock` with the generated mocks. If a mock is missing, add the `//go:generate` line and regenerate.
- Assertions: `require` for every error and precondition.
- Context: `t.Context()` in new tests, even where older tests use `context.Background()`.
- Fixtures go in a `testdata/` folder next to the test. Integration tests get the `//go:build integration` tag and use Testcontainers.
- Mark helpers with `t.Helper()`, and clean up with `t.Cleanup()`.
- Time-dependent code (polling, backoff, retries, timeouts, tickers): wrap the test in `synctest.Test(t, func(t *testing.T) {...})` (`testing/synctest`, Go 1.25+). Inside it, time is fake and `synctest.Wait()` waits for the goroutines to settle, so the test runs instantly and isn't flaky. Use it instead of real `time.Sleep` or a shortened interval.

## Modern syntax

In the code you write or edit, use the newer form whenever the target version allows it, even if nearby code uses the old pattern. Keep the old form only when the new one wouldn't compile or would change behaviour.

| Since | Write | Instead of |
|---|---|---|
| 1.19 | `atomic.Int64`, `atomic.Pointer[T]`, `fmt.Appendf` | `atomic.AddInt64` on a bare int, `[]byte(fmt.Sprintf(...))` |
| 1.20 | `errors.Join(a, b)`, `strings.CutPrefix`, `context.WithCancelCause` | joining by hand, `HasPrefix` + `TrimPrefix` |
| 1.21 | `min`/`max`, `clear(m)`, `slices.*`, `maps.*`, `sync.OnceValue`, `context.AfterFunc` | if/else, delete loops, hand-written search and sort, `sync.Once` plus a variable |
| 1.22 | `for i := range n`, `cmp.Or(a, b, "def")`, `mux.HandleFunc("GET /x/{id}", h)` + `r.PathValue` | the three-clause loop, a chain of zero-value checks, method checks inside handlers |
| 1.23 | `slices.Collect(maps.Keys(m))`, `slices.Sorted(...)` | appending keys in a loop |
| 1.24 | `t.Context()`, `b.Loop()`, `omitzero`, `strings.SplitSeq` | `context.Background()` in tests, `b.N` loop, `omitempty` on structs/time, `range strings.Split` |
| 1.25 | `wg.Go(fn)` (or `errgroup` when goroutines can fail), `synctest.Test` | `wg.Add(1)` + `go func(){ defer wg.Done() }()`, `time.Sleep` in tests |
| 1.26 | `new(30)`, `errors.AsType[*T](err)` | a temp var plus `&x`, `var t *T; errors.As(err, &t)` |
| 1.27 | `strings.CutLast`/`bytes.CutLast`, promoted fields set directly in struct literals (`Doc{CreatedBy: "x"}`), methods with their own type parameters (not allowed in interfaces), `URL.Clone`/`Values.Clone`, the stdlib `uuid` package | `LastIndex` + slicing, `Doc{AuditInfo: AuditInfo{...}}`, package-level generic helpers, copying a URL by hand, `github.com/google/uuid` |

**`encoding/json/v2`** (1.27): use it for new JSON code only. It changes wire behaviour (a nil slice becomes `[]` instead of `null`, and duplicate keys are rejected), so leave existing `encoding/json` code alone unless the user asks for a migration.
