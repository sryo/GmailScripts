/*
Passive signal collection for the classifier training set.
- User SALVAGES a thread (removes 🗑️ before deleteOlder fires): "keep this kind" example
- User DISCARDS a thread straight to Gmail trash within HARVEST_LOOKBACK_DAYS: "trash this kind" example
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function harvestCorrections() {
  const tabs = getClassifierTabs();
  const trackingData = tabs.tracking.getDataRange().getValues();
  const index = buildTrackingIndex_(trackingData);

  const trainingRows = [];
  const rowsToDelete = {};

  collectSalvaged_(index.pretrashed, trainingRows, rowsToDelete);
  collectUserDiscarded_(tabs.tracking, index.user_discarded, trainingRows);
  collectStale_(trackingData, rowsToDelete);

  appendRowsBatch(tabs.training, trainingRows);
  const deleteList = Object.keys(rowsToDelete).map(Number);
  if (deleteList.length > 0) deleteRowsReverse(tabs.tracking, deleteList);
}

function trackPretrashedBatch(threadIds) {
  if (!threadIds || threadIds.length === 0) return;
  const tabs = getClassifierTabs();
  const existing = buildTrackingIndex_(tabs.tracking.getDataRange().getValues()).pretrashed;
  const now = new Date().toISOString();
  const newRows = threadIds.filter(id => !existing[id]).map(id => [id, 'pretrashed', now]);
  appendRowsBatch(tabs.tracking, newRows);
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
  const salvagedRowIdxs = [];
  candidates.forEach(c => {
    try {
      const thread = GmailApp.getThreadById(c.threadId);
      if (!thread || thread.isInTrash()) {
        rowsToDelete[c.rowIdx] = true;
      } else {
        salvagedThreads.push(thread);
        salvagedRowIdxs.push(c.rowIdx);
      }
    } catch (e) {
      console.log(`collectSalvaged: thread ${c.threadId} unreachable (${e.toString()}), dropping.`);
      rowsToDelete[c.rowIdx] = true;
    }
  });

  if (salvagedThreads.length === 0) return;
  const features = buildThreadFeatures(salvagedThreads);
  const now = new Date().toISOString();
  features.forEach(f => trainingRows.push([now, f.id, f.sender, f.subject, f.snippet, VERDICT_KEEP, 'salvaged']));
  salvagedRowIdxs.forEach(idx => { rowsToDelete[idx] = true; });
}

function collectUserDiscarded_(trackingSheet, seenIndex, trainingRows) {
  const threads = GmailApp.search(`in:trash newer_than:${HARVEST_LOOKBACK_DAYS}d -label:${LABEL_PRETRASH}`);
  const fresh = threads.filter(t => !seenIndex[t.getId()]);
  if (fresh.length === 0) return;

  const features = buildThreadFeatures(fresh);
  const now = new Date().toISOString();
  const newTrackingRows = [];
  features.forEach(f => {
    trainingRows.push([now, f.id, f.sender, f.subject, f.snippet, VERDICT_TRASH, 'user_discarded']);
    newTrackingRows.push([f.id, 'user_discarded', now]);
  });
  appendRowsBatch(trackingSheet, newTrackingRows);
}

function collectStale_(trackingData, rowsToDelete) {
  const cutoffMs = Date.now() - (HARVEST_LOOKBACK_DAYS + 1) * 24 * 3600 * 1000;
  for (let i = 1; i < trackingData.length; i++) {
    const ts = Date.parse(trackingData[i][2]);
    if (isNaN(ts) || ts < cutoffMs) rowsToDelete[i + 1] = true;
  }
}

function buildTrackingIndex_(trackingData) {
  const idx = { pretrashed: {}, user_discarded: {} };
  for (let i = 1; i < trackingData.length; i++) {
    const [threadId, type] = trackingData[i];
    if (idx[type] && !idx[type][threadId]) idx[type][threadId] = i + 1;
  }
  return idx;
}
