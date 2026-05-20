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

## Triggers
- `cleanUp`: every 5 min.
- `bunch`: every 1 min.
- `removeEmptyLabels`: every 30 min.
- `sendBurndown`: daily at `BURNDOWN_HOUR`.

`ping`, `stash`, `archive*`, `processBurndownReplies_` etc. run inside `cleanUp()`. No separate trigger.

## User assumptions
The user expresses intent through Gmail's importance flag and the script-managed
labels. Six manual gestures:
- Mark **important** = "I want to see this."
- Mark **unimportant** = "I don't care."
- Remove **🗑️** = salvage; the thread should be kept (becomes a KEEP training row).
- Apply **↩️** = reply later; thread returns to Hot and is tracked like an auto-ping.
- Remove **↩️** = dismiss a ping; the thread should be archived.
- Apply **🦾** = draft me a reply via LLM. Stays on the thread until the draft is sent or deleted.

One-time setup, optional but recommended: label a handful of your sent emails
with **🫵** so the drafter has voice examples to mimic.

## Contracts
- Gmail's `is:important` flag is the single source of truth; everything else cascades from it.
- LLM only flips importance via promote/demote. Never trashes, archives, or labels.
- Pretrash is category-based (low_priority OR promos OR category:updates), not generic `is:unimportant`.
- Pinned threads are always promoted to important.
- Stash requires `is:important has:attachment`. Demote strips Stash.
- Bunch only labels importants. Demote strips bunch labels (domain pattern).
- Ping is one-shot per thread. Tracking row is permanent.
- Manually applied ↩️ is treated like an auto-ping (moved to inbox, tracked).
- If ↩️ is applied to a pretrashed thread (🗑️), the 🗑️ is stripped (salvage override).
- Script archives a thread when its ↩️ label is removed.
- Stale pings (older than PING_EXPIRE_DAYS) archive passively.
- Script drafts a reply on 🦾-labeled threads using up to VOICE_EXAMPLES_MAX sent emails labeled 🫵 as few-shot.
- The 🦾 label stays until the draft is sent or deleted by the user; only then does the script remove it.
- A pretrashed thread (🗑️) carries no other labels; entry points strip them.
- Burndown sends one self-mail digest per day listing important unread unreplied threads with Riff drafts as suggestions; the user's reply to that digest is parsed into per-thread drafts (or sends, if `BURNDOWN_AUTOSEND`).
- Each user reply to a burndown is processed at most once, keyed by message ID via `TRACKING_TYPE_BURNDOWN_PROCESSED`.

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
Hot, Meh, Ping, Bunch, Stash borrowed from [Posta](https://sryo.github.io/Posta/).
Burndown is the daily reply-triage digest.

## Constants
All in `_config.gs`. Time windows, TTLs, classifier thresholds, search batch limits.

## Phase 3
LLM is in shadow mode (`CLASSIFIER_SHADOW_MODE = true`): logs only, doesn't act.
Flip to false when the Wins tab shows the LLM is reliably winning. Cold-start
abstains until ~5 keep + ~5 trash examples accumulate in Training.
