/*
Tracking tab: thin store of orthogonal per-thread markers used by ping, riff, and burndown.
The classifier loop's own bookkeeping lives in Observations.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

let _trackingValuesCache = null;

function getTrackingValues_() {
  if (_trackingValuesCache === null) {
    _trackingValuesCache = getClassifierTabs().tracking.getDataRange().getValues();
  }
  return _trackingValuesCache;
}

function invalidateTrackingValuesCache_() {
  _trackingValuesCache = null;
}

function recordTrackingRows(threadIds, type) {
  if (!threadIds || threadIds.length === 0) return;
  const now = new Date().toISOString();
  appendRowsBatch(getClassifierTabs().tracking, threadIds.map(id => [id, type, now]));
  invalidateTrackingValuesCache_();
}

// {threadId: rowNumber} for a single type. Used by ping/riff to dedup + detect dismissal/discard.
function buildSimpleTrackingIndex_(type) {
  const data = getTrackingValues_();
  const idx = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === type && !idx[data[i][0]]) idx[data[i][0]] = i + 1;
  }
  return idx;
}

// Drops burndown_processed rows older than BURNDOWN_PROCESSED_TTL_DAYS. Pinged/drafted are
// state-managed by their own loops (riff deletes drafted on send; pinged is a permanent marker).
function pruneTracking_() {
  const data = getTrackingValues_();
  if (data.length < 2) return;
  const cutoff = Date.now() - BURNDOWN_PROCESSED_TTL_DAYS * 24 * 3600 * 1000;
  const rowsToDelete = [];
  for (let i = 1; i < data.length; i++) {
    const [, type, ts] = data[i];
    if (type !== TRACKING_TYPE_BURNDOWN_PROCESSED) continue;
    const t = Date.parse(ts);
    if (isNaN(t) || t < cutoff) rowsToDelete.push(i + 1);
  }
  if (rowsToDelete.length > 0) {
    deleteRowsReverse(getClassifierTabs().tracking, rowsToDelete);
    invalidateTrackingValuesCache_();
  }
}
