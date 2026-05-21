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
- `cleanUp`: every 5 min. Fast Gmail bookkeeping only.
- `cleanUpDeep`: every 15 min. Observation engine + classifier + riff + burndown-reply.
- `bunch`: every 5 min.
- `removeEmptyLabels`: every 30 min.
- `sendBurndown`: daily at `BURNDOWN_HOUR`.
- `dailyMaintenance`: daily at `TRIGGER_DAILY_MAINTENANCE_HOUR`. Retention + scoreboard.

Routines inside `cleanUp`: `markDoneAsRead`, `markPinnedAsImportant`, `deleteOlder`, `preTrashLowPriority`, `markTrashAsUnimportant`, `archiveDismissedPings_`, `archiveStalePings_`, `ping`, `syncManualPings_`, `stash`, `archiveInbox`.

Routines inside `cleanUpDeep`: `observePass`, `predictPass`, `settlePass`, `applyClassifierActions`, `riff`, `processBurndownReplies_`.

Routines inside `dailyMaintenance`: `pruneObservations_`, `pruneTracking_`, `rebuildScoreboard`.

After changing any `TRIGGER_*_MIN` constant, re-run `install` (it always recreates triggers).

## User assumptions
The user expresses intent through Gmail's importance flag and the script-managed
labels. Manual gestures the system reads as signal:
- Mark **important** = "I want to see this." (user_flip → KEEP if was unimportant)
- Mark **unimportant** = "I don't care." (user_flip → TRASH if was important)
- Remove **🗑️** = salvage; the thread should be kept (user_salvage → KEEP).
- Star / apply **pinned** / **snoozed** = explicit positive (user_star_pin → KEEP).
- Reply via burndown = strongest positive (user_burndown_reply → KEEP).
- Apply **↩️** = reply later; thread returns to Hot and is tracked like an auto-ping.
- Remove **↩️** = dismiss a ping; the thread should be archived.
- Apply **🦾** = draft me a reply via LLM. Stays on the thread until the draft is sent or deleted.
- Apply **🫵** = voice corpus *and* hands-off marker: thread is excluded from auto-ping and auto-pretrash. The drafter still pulls 🫵-labeled sent emails as voice examples.

Silence past `FLIP_WINDOW_HOURS` (72h) counts as confirmation of Gmail's call (gmail_held).

One-time setup: run `seedObservations` from the menu to bootstrap the classifier with current important + unimportant samples. Label a handful of your sent emails with **🫵** so the drafter has voice examples to mimic.

## Observation model
The classifier loop is one sheet (`Observations`) with a state machine per row:
- `pending` — created by `observePass` when Gmail tags a thread, mutated by `predictPass` (LLM verdict) and `settlePass`.
- `corrected` — user took action that flipped or reinforced Gmail's call within the window.
- `confirmed` — flip window elapsed with no user action; Gmail's call is treated as truth.
- `expired` — thread became unreachable before settling; row discarded for training.

Pretrash rows use `PRETRASH_AGE_DAYS` as their settle window (not `FLIP_WINDOW_HOURS`) since the user has a longer salvage grace period before auto-deletion.

`Scoreboard` is a derived dashboard rebuilt every deep pass; aggregates Gmail accuracy vs. LLM accuracy per time window.

`Tracking` carries three orthogonal markers only: pinged, drafted, burndown_processed (msgId-keyed dedup for the burndown reply parser).

## Contracts
- Gmail's `is:important` flag is the source of truth at observation time; the user is the final arbiter via flips inside `FLIP_WINDOW_HOURS`.
- LLM only flips importance via active classification (when `CLASSIFIER_SHADOW_MODE = false`), and only when it disagrees with Gmail at `CLASSIFIER_CONFIDENCE_THRESHOLD` or higher. Never trashes, archives, or labels.
- LLM-driven flips set `llmActed = true` on the observation; settle pass ignores those for user_flip detection (self-bias prevention).
- Pretrash is category-based (low_priority OR promos OR category:updates), not generic `is:unimportant`. Creates its own observation epoch with `pretrashed = true`.
- Pinned threads are always promoted to important.
- Stash requires `is:important has:attachment`. Demote strips Stash.
- Bunch only labels importants. Demote strips bunch labels (domain pattern).
- Ping is one-shot per thread. Tracking row is permanent.
- Manually applied ↩️ is treated like an auto-ping (moved to inbox, tracked).
- If ↩️ is applied to a pretrashed thread (🗑️), the 🗑️ is stripped (salvage override).
- If a 🗑️ thread becomes starred, important, replied-to (`from:me`), or labeled 🦾, the 🗑️ is stripped on the next cleanUp.
- Script archives a thread when its ↩️ label is removed.
- Stale pings (older than PING_EXPIRE_DAYS) archive passively.
- Script drafts a reply on 🦾-labeled threads using up to VOICE_EXAMPLES_MAX sent emails labeled 🫵 as few-shot.
- The 🦾 label stays until the draft is sent or deleted by the user; only then does the script remove it.
- A pretrashed thread (🗑️) carries no other labels; entry points strip them.
- Burndown sends one self-mail digest per day listing important unread unreplied threads with Riff drafts as suggestions; the user's reply to that digest is parsed into per-thread drafts (or sends, if `BURNDOWN_AUTOSEND`).
- Each user reply to a burndown is processed at most once, keyed by message ID via `TRACKING_TYPE_BURNDOWN_PROCESSED`. Replied-to threads have their pending observation settled directly as `user_burndown_reply → KEEP`.

## Known limitations (accepted, not bugs)
- GmailApp.search caps at 500. `OBSERVE_BATCH_LIMIT` further caps to 200 per pass; backlogs catch up over subsequent runs.
- Apps Script doesn't serialize triggers. No LockService.
- Observation row updates are per-row writes (no bulk-range API for arbitrary rows); bounded by `SETTLE_BATCH_LIMIT`.

## Decided against
- LLM gating pretrash decisions.
- LLM acting outside the importance flag.
- Per-domain labels on unimportants.
- Migrating legacy Training/Decisions/Wins data; the rebuild started fresh.
- LockService for cleanUp concurrency.

## Vocabulary
Hot, Meh, Ping, Bunch, Stash borrowed from [Posta](https://sryo.github.io/Posta/).
Burndown is the daily reply-triage digest.

## Constants
All in `_config.gs`. Time windows, TTLs, classifier thresholds, search batch limits.

## Phase 3
LLM is in shadow mode (`CLASSIFIER_SHADOW_MODE = true`): predicts on every pending observation, but doesn't flip Gmail's flag. Flip to false when the Scoreboard tab shows the LLM reliably winning. Cold-start abstains until `CLASSIFIER_MIN_EXAMPLES_PER_CLASS` keep + trash examples are settled in Observations.
