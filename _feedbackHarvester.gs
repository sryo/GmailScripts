/*
Builds classifier training rows from user corrections:
- SALVAGE  (user removes 🗑️ on a pretrashed thread):  "keep this kind"  example
- DEMOTE   (user flips is:important → unimportant):    "trash this kind" example
- PROMOTE  (user flips is:unimportant → important):    "keep this kind"  example
LLM-driven flips are filtered out so the LLM doesn't train on its own output.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function harvestCorrections() {
  const tabs = getClassifierTabs();
  const trackingData = getTrackingValues_();
  const index = buildTrackingIndex(trackingData);

  const trainingRows = [];
  const rowsToDelete = {};

  collectSalvaged_(index[TRACKING_TYPE_PRETRASHED], trainingRows, rowsToDelete);
  collectDemotedImportant_(index[TRACKING_TYPE_IMPORTANT_SEEN], index[TRACKING_TYPE_LLM_DEMOTED], trainingRows, rowsToDelete);
  collectPromotedUnimportant_(index[TRACKING_TYPE_UNIMPORTANT_SEEN], index[TRACKING_TYPE_LLM_PROMOTED], trainingRows, rowsToDelete);
  collectStale_(trackingData, rowsToDelete);
  pruneDecisions_();

  appendRowsBatch(tabs.training, trainingRows);
  const deleteList = Object.keys(rowsToDelete).map(Number);
  if (deleteList.length > 0) {
    deleteRowsReverse(tabs.tracking, deleteList);
    invalidateTrackingValuesCache_();
  }
}

function bootstrapTraining() {
  const tabs = getClassifierTabs();
  // Idempotent: skip if a bootstrap was already done.
  if (tabs.training.getLastRow() > 1) {
    const sources = tabs.training.getRange(2, 7, tabs.training.getLastRow() - 1, 1).getValues();
    if (sources.some(([s]) => s === SOURCE_BOOTSTRAP)) {
      Logger.log('Bootstrap already done; clear the Training tab to re-run.');
      return;
    }
  }
  const importants = GmailApp.search('is:important', 0, BOOTSTRAP_SAMPLE_SIZE);
  const unimportants = GmailApp.search('is:unimportant', 0, BOOTSTRAP_SAMPLE_SIZE);
  const rows = [];
  pushTrainingRows_(rows, importants, VERDICT_KEEP, SOURCE_BOOTSTRAP);
  pushTrainingRows_(rows, unimportants, VERDICT_TRASH, SOURCE_BOOTSTRAP);
  appendRowsBatch(tabs.training, rows);
  Logger.log('Bootstrap seeded ' + importants.length + ' KEEP and ' + unimportants.length + ' TRASH examples.');
}

function pushTrainingRows_(trainingRows, threads, verdict, source) {
  if (threads.length === 0) return;
  const features = buildThreadFeatures(threads);
  const now = new Date().toISOString();
  features.forEach(f => trainingRows.push([now, f.id, f.sender, f.subject, f.snippet, verdict, source]));
}

function collectSalvaged_(pretrashedIndex, trainingRows, rowsToDelete) {
  const pretrashedNow = new Set();
  GmailApp.search('label:' + LABEL_PRETRASH).forEach(t => pretrashedNow.add(t.getId()));
  const pretrashedThenTrashed = new Set();
  GmailApp.search('in:trash label:' + LABEL_PRETRASH).forEach(t => pretrashedThenTrashed.add(t.getId()));

  const candidates = [];
  Object.keys(pretrashedIndex).forEach(threadId => {
    const rowIdx = pretrashedIndex[threadId];
    if (pretrashedNow.has(threadId)) return;
    if (pretrashedThenTrashed.has(threadId)) {
      rowsToDelete[rowIdx] = true;
      return;
    }
    candidates.push({ threadId, rowIdx });
  });

  const salvagedThreads = [];
  candidates.forEach(c => {
    try {
      const thread = GmailApp.getThreadById(c.threadId);
      if (!thread || thread.isInTrash()) {
        rowsToDelete[c.rowIdx] = true;
      } else {
        salvagedThreads.push(thread);
        rowsToDelete[c.rowIdx] = true;
      }
    } catch (e) {
      console.log(`collectSalvaged: thread ${c.threadId} unreachable (${e.toString()}), dropping.`);
      rowsToDelete[c.rowIdx] = true;
    }
  });

  pushTrainingRows_(trainingRows, salvagedThreads, VERDICT_KEEP, SOURCE_SALVAGED);
}

function collectPromotedUnimportant_(seenUnimportant, llmPromoted, trainingRows, rowsToDelete) {
  collectImportanceFlip_({
    searchQuery: 'is:unimportant in:inbox newer_than:' + PROMOTE_LOOKBACK_DAYS + 'd',
    seenIndex: seenUnimportant,
    llmIndex: llmPromoted,
    seenType: TRACKING_TYPE_UNIMPORTANT_SEEN,
    verdict: VERDICT_KEEP,
    source: SOURCE_PROMOTED_UNIMPORTANT,
    confirmFlip: t => t.isImportant()
  }, trainingRows, rowsToDelete);
}

function collectDemotedImportant_(seenImportant, llmDemoted, trainingRows, rowsToDelete) {
  collectImportanceFlip_({
    searchQuery: 'is:important',
    seenIndex: seenImportant,
    llmIndex: llmDemoted,
    seenType: TRACKING_TYPE_IMPORTANT_SEEN,
    verdict: VERDICT_TRASH,
    source: SOURCE_DEMOTED_IMPORTANT,
    confirmFlip: t => !t.isImportant(),
    onConfirmed: ts => cleanDemotedThreads(ts, 'user-demoted')
  }, trainingRows, rowsToDelete);
}

// Shared engine for "user flipped Gmail's importance flag" detection. Diffs the previously-seen
// thread set against the current Gmail-importance set, drops LLM-driven flips, confirms the
// transition via per-message importance, and writes a training row for each user-driven flip.
function collectImportanceFlip_(opts, trainingRows, rowsToDelete) {
  const currentIds = new Set();
  GmailApp.search(opts.searchQuery).forEach(t => currentIds.add(t.getId()));

  const flippedIds = Object.keys(opts.seenIndex).filter(id => !currentIds.has(id));
  flippedIds.forEach(id => {
    rowsToDelete[opts.seenIndex[id]] = true;
    if (opts.llmIndex[id]) rowsToDelete[opts.llmIndex[id]] = true;
  });

  const userFlippedIds = flippedIds.filter(id => !opts.llmIndex[id]).slice(0, HARVEST_BATCH_LIMIT);
  const candidates = [];
  userFlippedIds.forEach(id => {
    try {
      const t = GmailApp.getThreadById(id);
      if (t && !t.isInTrash()) candidates.push(t);
    } catch (e) { /* row already queued for delete above */ }
  });

  // confirmFlip guards against threads pushed out of the 500-result ceiling or that aged out
  // of the lookback window rather than truly flipped by the user.
  const confirmed = candidates.filter(t => opts.confirmFlip(t));

  pushTrainingRows_(trainingRows, confirmed, opts.verdict, opts.source);
  if (opts.onConfirmed && confirmed.length > 0) opts.onConfirmed(confirmed);

  // Consume any llm-marker whose thread is back in the seen set: user reversed the LLM, restart fresh.
  const newIds = [...currentIds].filter(id => !opts.seenIndex[id]);
  newIds.forEach(id => {
    if (opts.llmIndex[id]) rowsToDelete[opts.llmIndex[id]] = true;
  });
  recordTrackingRows(newIds, opts.seenType);
}

function collectStale_(trackingData, rowsToDelete) {
  // important_seen and unimportant_seen are actively managed by collect*_ and exempt from TTL.
  // pinged is permanent (a thread is pinged at most once). Others get a TTL.
  const now = Date.now();
  const ttlByType = {
    [TRACKING_TYPE_PRETRASHED]:           (PRETRASH_AGE_DAYS + 1)        * 24 * 3600 * 1000,
    [TRACKING_TYPE_CLASSIFIED_IMPORTANCE]: CLASSIFIED_IMPORTANCE_TTL_DAYS * 24 * 3600 * 1000,
    [TRACKING_TYPE_LLM_DEMOTED]:          LLM_DEMOTED_TTL_DAYS           * 24 * 3600 * 1000,
    [TRACKING_TYPE_LLM_PROMOTED]:         LLM_PROMOTED_TTL_DAYS          * 24 * 3600 * 1000,
    [TRACKING_TYPE_BURNDOWN_PROCESSED]:   BURNDOWN_PROCESSED_TTL_DAYS    * 24 * 3600 * 1000
  };
  for (let i = 1; i < trackingData.length; i++) {
    const [, type] = trackingData[i];
    const ttl = ttlByType[type];
    if (ttl === undefined) continue;
    const ts = Date.parse(trackingData[i][2]);
    if (isNaN(ts) || ts < now - ttl) rowsToDelete[i + 1] = true;
  }
}

function pruneDecisions_() {
  const decisions = getClassifierTabs().decisions;
  if (decisions.getLastRow() < 2) return;
  const data = decisions.getDataRange().getValues();
  const cutoff = Date.now() - DECISIONS_TTL_DAYS * 24 * 3600 * 1000;
  const rowsToDelete = [];
  for (let i = 1; i < data.length; i++) {
    const ts = Date.parse(data[i][0]);
    if (isNaN(ts) || ts < cutoff) rowsToDelete.push(i + 1);
  }
  if (rowsToDelete.length > 0) deleteRowsReverse(decisions, rowsToDelete);
}

