/*
Observation engine: the only stateful classifier-side store.

A row's lifecycle:
  observePass  → pending row written when Gmail tags a thread important/unimportant
  predictPass  → LLM verdict + confidence written onto the same pending row
  settlePass   → pending → corrected (user flipped) / confirmed (window expired) / expired

Pretrashed threads get their own observation epoch with the longer PRETRASH_AGE_DAYS window.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

let _observationsCache;

function observePass() {
  const tabs = getClassifierTabs();
  const known = loadObservationsIndex_(tabs.observations);
  const lookbackQuery = 'newer_than:' + OBSERVATION_LOOKBACK_DAYS + 'd in:inbox';

  const importantThreads = GmailApp.search('is:important ' + lookbackQuery, 0, OBSERVE_BATCH_LIMIT);
  const unimportantThreads = GmailApp.search('is:unimportant ' + lookbackQuery, 0, OBSERVE_BATCH_LIMIT);

  const newRows = [];
  recordNewObservations_(importantThreads, VERDICT_KEEP, false, known, newRows);
  recordNewObservations_(unimportantThreads, VERDICT_TRASH, false, known, newRows);
  if (newRows.length > 0) {
    appendRowsBatch(tabs.observations, newRows);
    _observationsCache = null;
    Logger.log('🔭 Observed ' + newRows.length + ' new thread states.');
  }
}

// Called from preTrashLowPriority (cleanUp.gs). Pretrash is a stronger trash signal than
// is:unimportant alone, with a longer settle window (PRETRASH_AGE_DAYS) — gives the user time
// to salvage. Each pretrash action creates its own observation epoch.
function recordPretrashObservations(threads) {
  if (!threads || threads.length === 0) return;
  const tabs = getClassifierTabs();
  const known = loadObservationsIndex_(tabs.observations);
  const newRows = [];
  recordNewObservations_(threads, VERDICT_TRASH, true, known, newRows);
  if (newRows.length > 0) {
    appendRowsBatch(tabs.observations, newRows);
    _observationsCache = null;
  }
}

// Creates a fresh row only if no pending row already covers this (threadId, gmailVerdict, pretrashed)
// triple. Threads already settled in the same state are skipped — they'll re-observe when their
// state next changes (which is the real signal).
function recordNewObservations_(threads, gmailVerdict, pretrashed, known, outRows) {
  if (!threads || threads.length === 0) return;
  const features = buildThreadFeatures(threads);
  const messagesByThread = GmailApp.getMessagesForThreads(threads);
  const now = Date.now();
  const windowMs = (pretrashed ? PRETRASH_AGE_DAYS * 24 : FLIP_WINDOW_HOURS) * 3600 * 1000;
  features.forEach((f, i) => {
    const key = obsKey_(f.id, gmailVerdict, pretrashed);
    if (known.pending[key] || known.recent[key]) return;
    // Heuristic settle: if the thread has been in this state long enough that the flip window
    // already would have closed, mark it confirmed immediately — gives us training data on day one
    // instead of waiting 72h. New activity will create a new observation epoch on the next pass.
    const lastDate = messagesByThread[i] && messagesByThread[i].length > 0
      ? messagesByThread[i][messagesByThread[i].length - 1].getDate().getTime()
      : 0;
    const settledAlready = lastDate > 0 && (now - lastDate) > windowMs;
    const observedAt = new Date(now).toISOString();
    const row = newObservationRow_({
      threadId: f.id, observedAt,
      sender: f.sender, subject: f.subject, snippet: f.snippet,
      gmailVerdict, pretrashed
    });
    if (settledAlready) {
      setSettled_(row, gmailVerdict, TRUTH_SOURCE_GMAIL_HELD, observedAt, OBS_STATE_CONFIRMED);
    }
    outRows.push(row);
    known.pending[key] = true;
  });
}

function predictPass() {
  const tabs = getClassifierTabs();
  const { data, col } = readObservations_(tabs.observations);
  if (data.length < 2) return;

  const pending = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][col.state] !== OBS_STATE_PENDING) continue;
    if (data[i][col.llmVerdict]) continue;
    pending.push({ rowNum: i + 1, row: data[i] });
  }
  if (pending.length === 0) return;

  const features = pending.map(p => ({
    id: p.row[col.threadId],
    sender: p.row[col.sender],
    subject: p.row[col.subject],
    snippet: p.row[col.snippet]
  }));
  const results = classifyFeatures(features);
  if (!results) return;

  const byId = {};
  results.forEach(r => byId[r.id] = r);

  const updates = [];
  pending.forEach(p => {
    const r = byId[p.row[col.threadId]];
    if (!r) return;
    const llmVerdict = String(r.verdict || '').toLowerCase();
    const conf = Number(r.confidence) || 0;
    p.row[col.llmVerdict] = llmVerdict;
    p.row[col.llmConfidence] = conf;
    updates.push({ rowNum: p.rowNum, row: p.row });
  });
  applyObservationUpdates_(tabs.observations, updates);
  if (updates.length > 0) Logger.log('🔮 Predicted on ' + updates.length + ' observations.');
}

function settlePass() {
  const tabs = getClassifierTabs();
  const { data, col } = readObservations_(tabs.observations);
  if (data.length < 2) return;

  const now = Date.now();
  const expiryMs = PENDING_EXPIRY_DAYS * 24 * 3600 * 1000;
  const updates = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[col.state] !== OBS_STATE_PENDING) continue;
    const observedAt = Date.parse(row[col.observedAt]);
    if (isNaN(observedAt)) continue;

    let thread = null;
    try { thread = GmailApp.getThreadById(row[col.threadId]); } catch (e) { /* unreachable */ }

    if (!thread) {
      if (now - observedAt > expiryMs) {
        markExpired_(row);
        updates.push({ rowNum: i + 1, row });
      }
      continue;
    }

    if (settleOne_(row, thread, observedAt, now, col)) {
      updates.push({ rowNum: i + 1, row });
    }
    if (updates.length >= SETTLE_BATCH_LIMIT) break;
  }
  applyObservationUpdates_(tabs.observations, updates);
  if (updates.length > 0) Logger.log('⚖ Settled ' + updates.length + ' observations.');
}

// Called by burndown when a user reply is parsed for a thread: any pending observation for that
// thread is the strongest possible KEEP signal (the user wrote prose back). Idempotent — settles
// at most one row per thread per call.
function settleBurndownReplied(threadIds) {
  if (!threadIds || threadIds.length === 0) return;
  const tabs = getClassifierTabs();
  const { data, col } = readObservations_(tabs.observations);
  if (data.length < 2) return;
  const targets = new Set(threadIds);
  const nowIso = new Date().toISOString();
  const updates = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[col.state] !== OBS_STATE_PENDING) continue;
    if (!targets.has(row[col.threadId])) continue;
    setSettled_(row, VERDICT_KEEP, TRUTH_SOURCE_USER_BURNDOWN_REPLY, nowIso, OBS_STATE_CORRECTED);
    updates.push({ rowNum: i + 1, row });
  }
  applyObservationUpdates_(tabs.observations, updates);
  if (updates.length > 0) Logger.log('🔥 Burndown reply settled ' + updates.length + ' observations.');
}

function settleOne_(row, thread, observedAt, now, col) {
  const gmailVerdict = row[col.gmailVerdict];
  const pretrashed = row[col.pretrashed] === true || row[col.pretrashed] === 'TRUE';
  const llmActed = row[col.llmActed] === true || row[col.llmActed] === 'TRUE';
  const windowMs = (pretrashed ? PRETRASH_AGE_DAYS * 24 : FLIP_WINDOW_HOURS) * 3600 * 1000;
  const nowIso = new Date(now).toISOString();
  const labels = thread.getLabels().map(l => l.getName());

  if (thread.hasStarredMessages() || labels.indexOf('pinned') >= 0 || labels.indexOf('snoozed') >= 0) {
    const state = (gmailVerdict === VERDICT_KEEP) ? OBS_STATE_CONFIRMED : OBS_STATE_CORRECTED;
    return setSettled_(row, VERDICT_KEEP, TRUTH_SOURCE_USER_STAR_PIN, nowIso, state) || true;
  }

  if (pretrashed) {
    const stillPretrashed = labels.indexOf(LABEL_PRETRASH) >= 0;
    if (!stillPretrashed && !thread.isInTrash()) {
      return setSettled_(row, VERDICT_KEEP, TRUTH_SOURCE_USER_SALVAGE, nowIso, OBS_STATE_CORRECTED) || true;
    }
    if (thread.isInTrash() || now - observedAt > windowMs) {
      // User manually trashed early, or the 20-day pretrash window elapsed — either way, Gmail's call held.
      return setSettled_(row, VERDICT_TRASH, TRUTH_SOURCE_GMAIL_HELD, nowIso, OBS_STATE_CONFIRMED) || true;
    }
    return false;
  }

  // Importance-flip detection (non-pretrash row). Skip if the LLM was the one that flipped it.
  const currentIsImportant = thread.isImportant();
  const inTrash = thread.isInTrash();
  if (!llmActed) {
    if (gmailVerdict === VERDICT_KEEP && (!currentIsImportant || inTrash)) {
      return setSettled_(row, VERDICT_TRASH, TRUTH_SOURCE_USER_FLIP, nowIso, OBS_STATE_CORRECTED) || true;
    }
    if (gmailVerdict === VERDICT_TRASH && currentIsImportant && !inTrash) {
      return setSettled_(row, VERDICT_KEEP, TRUTH_SOURCE_USER_FLIP, nowIso, OBS_STATE_CORRECTED) || true;
    }
  }

  if (now - observedAt > windowMs) {
    return setSettled_(row, gmailVerdict, TRUTH_SOURCE_GMAIL_HELD, nowIso, OBS_STATE_CONFIRMED) || true;
  }
  return false;
}

// Bootstraps Observations on first run by sampling current is:important / is:unimportant threads as
// state=confirmed, truthSource=seed. Idempotent: skips if seed rows already exist. Run once from
// the menu after a fresh install — without it, predictPass abstains until the natural flip-window
// produces enough training rows.
function seedObservations() {
  const tabs = getClassifierTabs();
  const { data, col } = readObservations_(tabs.observations);
  for (let i = 1; i < data.length; i++) {
    if (data[i][col.truthSource] === TRUTH_SOURCE_SEED) {
      Logger.log('Seed already present; clear Observations to re-seed.');
      return;
    }
  }
  const important = GmailApp.search('is:important', 0, BOOTSTRAP_SAMPLE_SIZE);
  const unimportant = GmailApp.search('is:unimportant', 0, BOOTSTRAP_SAMPLE_SIZE);
  const rows = [];
  seedThreads_(important, VERDICT_KEEP, rows);
  seedThreads_(unimportant, VERDICT_TRASH, rows);
  if (rows.length > 0) {
    appendRowsBatch(tabs.observations, rows);
    _observationsCache = null;
  }
  Logger.log('🌱 Seeded ' + rows.length + ' observations (' + important.length + ' keep, ' + unimportant.length + ' trash).');
}

function seedThreads_(threads, gmailVerdict, outRows) {
  if (!threads || threads.length === 0) return;
  const features = buildThreadFeatures(threads);
  const observedAt = new Date().toISOString();
  features.forEach(f => {
    const row = newObservationRow_({
      threadId: f.id, observedAt,
      sender: f.sender, subject: f.subject, snippet: f.snippet,
      gmailVerdict, pretrashed: false
    });
    setSettled_(row, gmailVerdict, TRUTH_SOURCE_SEED, observedAt, OBS_STATE_CONFIRMED);
    outRows.push(row);
  });
}

// Active classification. In shadow mode, only marks llmActed=false (no inbox change). When the
// user flips CLASSIFIER_SHADOW_MODE to false, this is where the LLM actually changes Gmail's
// importance flag for high-confidence disagreements.
function applyClassifierActions() {
  if (CLASSIFIER_SHADOW_MODE) return;

  const tabs = getClassifierTabs();
  const { data, col } = readObservations_(tabs.observations);
  if (data.length < 2) return;

  const toDemote = [];
  const toPromote = [];
  const updates = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[col.state] !== OBS_STATE_PENDING) continue;
    if (row[col.pretrashed] === true || row[col.pretrashed] === 'TRUE') continue;
    if (row[col.llmActed] === true || row[col.llmActed] === 'TRUE') continue;
    const llmVerdict = row[col.llmVerdict];
    const gmailVerdict = row[col.gmailVerdict];
    if (!llmVerdict || llmVerdict === gmailVerdict) continue;
    const conf = Number(row[col.llmConfidence]) || 0;
    if (conf < CLASSIFIER_CONFIDENCE_THRESHOLD) continue;

    let thread;
    try { thread = GmailApp.getThreadById(row[col.threadId]); } catch (e) { continue; }
    if (!thread || thread.isInTrash()) continue;

    if (llmVerdict === VERDICT_TRASH && gmailVerdict === VERDICT_KEEP) toDemote.push(thread);
    else if (llmVerdict === VERDICT_KEEP && gmailVerdict === VERDICT_TRASH) toPromote.push(thread);
    else continue;
    row[col.llmActed] = true;
    updates.push({ rowNum: i + 1, row });
  }

  if (toDemote.length > 0) {
    GmailApp.markThreadsUnimportant(toDemote);
    cleanDemotedThreads(toDemote, 'LLM-demoted');
    Logger.log('📉 LLM demoted ' + toDemote.length + ' threads.');
  }
  if (toPromote.length > 0) {
    GmailApp.markThreadsImportant(toPromote);
    Logger.log('⭐ LLM promoted ' + toPromote.length + ' threads.');
  }
  applyObservationUpdates_(tabs.observations, updates);
}

// ===== schema + I/O helpers =====

function obsKey_(threadId, gmailVerdict, pretrashed) {
  return threadId + '|' + gmailVerdict + '|' + (pretrashed ? '1' : '0');
}

function newObservationRow_(props) {
  return [
    props.threadId,
    props.observedAt,
    props.sender,
    props.subject,
    props.snippet,
    props.gmailVerdict,
    !!props.pretrashed,
    '', 0, false,
    '', '', '',
    OBS_STATE_PENDING
  ];
}

function setSettled_(row, truthVerdict, truthSource, settledAt, state) {
  const col = observationsColMap_();
  row[col.settledAt] = settledAt;
  row[col.truthVerdict] = truthVerdict;
  row[col.truthSource] = truthSource;
  row[col.state] = state;
  return true;
}

function markExpired_(row) {
  const col = observationsColMap_();
  row[col.settledAt] = new Date().toISOString();
  row[col.state] = OBS_STATE_EXPIRED;
  return true;
}

function observationsColMap_() {
  const map = {};
  OBSERVATIONS_HEADERS.forEach((h, i) => { map[h] = i; });
  return map;
}

function readObservations_(sheet) {
  if (!_observationsCache) {
    _observationsCache = { data: sheet.getDataRange().getValues() };
  }
  return { data: _observationsCache.data, col: observationsColMap_() };
}

// Existing observations grouped into "pending" (still mutable) and "recent" (any non-expired row,
// pending or settled). recordNewObservations_ skips threads that already have an active row for
// the same (threadId, gmailVerdict, pretrashed) — re-observation only happens after the row is
// pruned (180d retention) or the thread genuinely changes state.
function loadObservationsIndex_(sheet) {
  const { data, col } = readObservations_(sheet);
  const pending = {};
  const recent = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (r[col.state] === OBS_STATE_EXPIRED) continue;
    const key = obsKey_(r[col.threadId], r[col.gmailVerdict], r[col.pretrashed] === true || r[col.pretrashed] === 'TRUE');
    if (r[col.state] === OBS_STATE_PENDING) pending[key] = i + 1;
    else recent[key] = i + 1;
  }
  return { pending, recent };
}

function applyObservationUpdates_(sheet, updates) {
  if (!updates || updates.length === 0) return;
  // Single-row writes — Apps Script batching of arbitrary rows requires range gymnastics;
  // the row-count here is bounded by SETTLE_BATCH_LIMIT and is fine in practice.
  updates.forEach(u => {
    sheet.getRange(u.rowNum, 1, 1, OBSERVATIONS_HEADERS.length).setValues([u.row]);
  });
  _observationsCache = null;
}

// Drops settled rows older than the retention window. corrected/seed rows stay forever — they are
// the highest-signal training data and are scarce relative to volume.
function pruneObservations_() {
  const tabs = getClassifierTabs();
  const { data, col } = readObservations_(tabs.observations);
  if (data.length < 2) return;
  const cutoff = Date.now() - OBSERVATION_RETENTION_DAYS_CONFIRMED * 24 * 3600 * 1000;
  const rowsToDelete = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (r[col.state] !== OBS_STATE_CONFIRMED && r[col.state] !== OBS_STATE_EXPIRED) continue;
    const settledAt = Date.parse(r[col.settledAt]);
    if (isNaN(settledAt) || settledAt < cutoff) rowsToDelete.push(i + 1);
  }
  if (rowsToDelete.length > 0) {
    deleteRowsReverse(tabs.observations, rowsToDelete);
    _observationsCache = null;
    Logger.log('🧹 Pruned ' + rowsToDelete.length + ' aged observation rows.');
  }
}
