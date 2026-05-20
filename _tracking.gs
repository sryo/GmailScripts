/*
Reads and writes the Tracking tab — the system's memory of what it has already done to each thread.
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

function trackPretrashedBatch(threadIds) {
  if (!threadIds || threadIds.length === 0) return;
  const existing = buildTrackingIndex(getTrackingValues_())[TRACKING_TYPE_PRETRASHED];
  recordTrackingRows(threadIds.filter(id => !existing[id]), TRACKING_TYPE_PRETRASHED);
}

function buildTrackingIndex(trackingData) {
  const idx = {
    [TRACKING_TYPE_PRETRASHED]: {},
    [TRACKING_TYPE_IMPORTANT_SEEN]: {},
    [TRACKING_TYPE_UNIMPORTANT_SEEN]: {},
    [TRACKING_TYPE_CLASSIFIED_IMPORTANCE]: {},
    [TRACKING_TYPE_LLM_DEMOTED]: {},
    [TRACKING_TYPE_LLM_PROMOTED]: {},
    [TRACKING_TYPE_PINGED]: {},
    [TRACKING_TYPE_DRAFTED]: {},
    [TRACKING_TYPE_BURNDOWN_PROCESSED]: {}
  };
  for (let i = 1; i < trackingData.length; i++) {
    const [threadId, type] = trackingData[i];
    if (idx[type] && !idx[type][threadId]) idx[type][threadId] = i + 1;
  }
  return idx;
}
