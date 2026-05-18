# AGENTS.md

Implementation contracts for anyone (human or AI) working in this repo.
Read README.md first for product goals.

## Communication
- No em-dashes anywhere.
- Terse. WHAT + WHY, never HOW.
- Show previews for prose edits before applying.
- Refactor freely when it makes the code better.

## No magic numbers or strings
Every numeric constant or stringly-typed value (intervals, TTLs, thresholds,
limits, tracking types, source labels) lives in `_config.gs`. Use the named
constant in code, never the literal. Exception: Gmail system-label names
(`pinned`, `snoozed`, `done`, `low_priority`, `promos`) stay as literals in
queries since they're external to our schema.

## Minimum effort
"Minimum effort" means minimum imposition on Gmail. Add the fewest labels,
the smallest state, the simplest queries that get the job done. Don't pollute
the mailbox with bookkeeping the user has to maintain. The user wants a
self-running system, not an admin task.

## External dependencies
`pinned`, `snoozed`, `done`, `low_priority`, `promos` are Gmail SYSTEM labels.
Always referenced as literals in queries; never wrapped in constants.

`category:updates` is a Gmail system category.

`is:important` / `is:unimportant` is Gmail's importance flag and is the single
source of truth for the cleanup pipeline.

## Triggers
- `cleanUp`: every 5 min.
- `tagEmailsByDomain`: every 1 min.
- `removeEmptyLabels`: every 30 min.

`ping`, `stash`, `archive*` etc. run inside `cleanUp()`. No separate trigger.

## Contracts
- LLM only flips importance via promote/demote. Never trashes, archives, or labels.
- Pretrash is category-based (low_priority OR promos OR category:updates), not generic `is:unimportant`.
- Pinned threads are always important. Manual user intent, never overridden.
- Stash requires `is:important has:attachment`. Demote strips Stash.
- Bunch only labels importants. Demote strips bunch labels (domain pattern).
- Ping is one-shot per thread. Tracking row is permanent.
- Dismiss a ping by removing ↩️. Script then unpins.
- Stale pings (older than PING_EXPIRE_DAYS) archive passively.

## Self-bias prevention
LLM-driven importance flips would otherwise look like user signal. Filtered via:
- `llm_demoted` marker written when LLM demotes; harvester skips.
- `llm_promoted` marker written when LLM promotes; harvester skips.
- Markers auto-consumed when the user reverses the LLM.

## Known limitations (accepted, not bugs)
- GmailApp.search caps at 500. `collectDemotedImportant_` searches `is:important` unbounded.
- Apps Script doesn't serialize triggers. No LockService.
- Tracking sheet is read multiple times per cleanUp run (not consolidated).

## Decided against
- LLM gating pretrash decisions.
- LLM acting outside the importance flag.
- Per-domain labels on unimportants.
- Stricter domain-label regex.
- LockService for cleanUp concurrency.

## Vocabulary
Borrowed from [Posta](https://sryo.github.io/Posta/):
Hot, Meh, Ping, Bunch, Stash.

## Constants
All in `_config.gs`. Time windows, TTLs, classifier thresholds, search batch limits.

## Phase 3
LLM is in shadow mode (`CLASSIFIER_SHADOW_MODE = true`): logs only, doesn't act.
Flip to false when the Wins tab shows the LLM is reliably winning. Cold-start
abstains until ~5 keep + ~5 trash examples accumulate in Training.
