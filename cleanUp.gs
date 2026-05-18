/*
Script that schedules unimportant mails for deletion and other general cleanup routines.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

const userProperties = PropertiesService.getUserProperties();
let lastCleanedTime = null;
let cleanedInCurrentIteration = false;

function cleanUp() {
  cleanedInCurrentIteration = false;
  lastCleanedTime = userProperties.getProperty(PROPS.LAST_CLEANED_TIME);
  if (lastCleanedTime == null) {
    lastCleanedTime = new Date().toISOString();
    userProperties.setProperty(PROPS.LAST_CLEANED_TIME, lastCleanedTime);
  }

  try { harvestCorrections(); } catch (e) { console.log('harvestCorrections failed: ' + e.toString()); }
  try { computeWins(); } catch (e) { console.log('computeWins failed: ' + e.toString()); }
  try { riff(); } catch (e) { console.log('riff failed: ' + e.toString()); }
  markDoneAsRead();
  markPinnedAsImportant();
  try { promoteFalseUnimportant(); } catch (e) { console.log('promoteFalseUnimportant failed: ' + e.toString()); }
  try { demoteFalseImportant(); } catch (e) { console.log('demoteFalseImportant failed: ' + e.toString()); }
  deleteOlder();
  preTrashLowPriority();
  markTrashAsUnimportant();
  archiveDismissedPings_();
  archiveStalePings_();
  ping();
  syncManualPings_();
  stash();
  archiveInbox();
  logCleanDate();
}

function markCleaned_() {
  cleanedInCurrentIteration = true;
  lastCleanedTime = new Date().toISOString();
}

function archiveInbox() {
  const threads = GmailApp.search('label:inbox is:read older_than:' + ARCHIVE_INBOX_AGE_DAYS + 'd -label:pinned -label:snoozed -label:"' + LABEL_PING + '"');
  if (threads.length === 0) return;
  Logger.log('📦 Archiving ' + threads.length + ' read threads.');
  markCleaned_();
  GmailApp.moveThreadsToArchive(threads);
}

function ping() {
  const pinged = buildTrackingIndex(getClassifierTabs().tracking.getDataRange().getValues())[TRACKING_TYPE_PINGED];
  const threads = GmailApp.search('is:read older_than:' + PING_PICKUP_DAYS + 'd newer_than:' + PING_EXPIRE_DAYS + 'd -from:me -label:done -label:pinned -label:snoozed -label:"' + LABEL_PING + '" -label:' + LABEL_PRETRASH + ' -label:"' + LABEL_AUTOREPLY + '" -label:"' + LABEL_STASH + '" -in:trash');
  const candidates = threads.filter(t => t.getMessageCount() === 1 && !pinged[t.getId()]);
  if (candidates.length === 0) return;
  Logger.log(LABEL_PING + ' Pinging ' + candidates.length + ' forgotten reads.');
  markCleaned_();
  getOrCreateUserLabel(LABEL_PING).addToThreads(candidates);
  applyPingTo_(candidates);
}

function syncManualPings_() {
  // Detects threads the user labeled ↩️ themselves and treats them like an auto-ping.
  // If the thread also carries 🗑️, strip pretrash: applying ↩️ is a stronger salvage signal.
  const pinged = buildTrackingIndex(getClassifierTabs().tracking.getDataRange().getValues())[TRACKING_TYPE_PINGED];
  const threads = GmailApp.search('label:"' + LABEL_PING + '" -in:trash');
  const untracked = threads.filter(t => !pinged[t.getId()]);
  if (untracked.length === 0) return;
  Logger.log(LABEL_PING + ' Syncing ' + untracked.length + ' manually pinged threads.');
  markCleaned_();

  const salvaged = GmailApp.search('label:"' + LABEL_PING + '" label:' + LABEL_PRETRASH);
  if (salvaged.length > 0) {
    getOrCreateUserLabel(LABEL_PRETRASH).removeFromThreads(salvaged);
    Logger.log(LABEL_PING + ' Stripped ' + LABEL_PRETRASH + ' from ' + salvaged.length + ' threads (manual ping override).');
  }
  applyPingTo_(untracked);
}

function applyPingTo_(threads) {
  if (!threads || threads.length === 0) return;
  GmailApp.moveThreadsToInbox(threads);
  try { recordTrackingRows(threads.map(t => t.getId()), TRACKING_TYPE_PINGED); } catch (e) { console.log('ping track: ' + e.toString()); }
}

function archiveDismissedPings_() {
  // Dismissal contract: the user removes the ↩️ label to dismiss a ping. We never strip the label
  // ourselves; its absence is the gesture. Tracking row stays after dismissal as a permanent
  // "already pinged" marker so ping() won't resurface the same thread twice.
  const pinged = buildTrackingIndex(getClassifierTabs().tracking.getDataRange().getValues())[TRACKING_TYPE_PINGED];
  const trackedIds = Object.keys(pinged);
  if (trackedIds.length === 0) return;

  const stillPinged = new Set();
  GmailApp.search('label:"' + LABEL_PING + '"').forEach(t => stillPinged.add(t.getId()));

  const dismissedIds = trackedIds.filter(id => !stillPinged.has(id));
  if (dismissedIds.length === 0) return;

  const toArchive = [];
  dismissedIds.forEach(id => {
    try {
      const t = GmailApp.getThreadById(id);
      if (t && !t.isInTrash()) toArchive.push(t);
    } catch (e) { /* thread gone, tracking stays as permanent marker */ }
  });

  if (toArchive.length === 0) return;
  Logger.log('📦 Archiving ' + toArchive.length + ' dismissed pings.');
  markCleaned_();
  GmailApp.moveThreadsToArchive(toArchive);
}

function archiveStalePings_() {
  // Passive dismissal: a pinged thread that aged past PING_MAX_AGE_DAYS without you acting.
  // Remove the ping label too so the thread is fully reset.
  const threads = GmailApp.search('label:"' + LABEL_PING + '" in:inbox older_than:' + PING_EXPIRE_DAYS + 'd');
  if (threads.length === 0) return;
  Logger.log('📦 Archiving ' + threads.length + ' stale pings.');
  markCleaned_();
  const pingLabel = GmailApp.getUserLabelByName(LABEL_PING);
  if (pingLabel) pingLabel.removeFromThreads(threads);
  GmailApp.moveThreadsToArchive(threads);
}

function stash() {
  // Bucketed at MAX_THREADS_TAG per run; bigger backlogs catch up over subsequent cleanUp cycles.
  const threads = GmailApp.search('is:important has:attachment -label:"' + LABEL_STASH + '" -label:' + LABEL_PRETRASH + ' -in:trash', 0, MAX_THREADS_TAG);
  if (threads.length === 0) return;
  Logger.log(LABEL_STASH + ' Stashing ' + threads.length + ' important attachments.');
  markCleaned_();
  getOrCreateUserLabel(LABEL_STASH).addToThreads(threads);
}

function markDoneAsRead() {
  const threads = GmailApp.search('label:done is:unread -label:pinned -label:snoozed');
  if (threads.length === 0) return;
  Logger.log('📖 Marking ' + threads.length + ' done threads as read.');
  markCleaned_();
  GmailApp.markThreadsRead(threads);
}

function preTrashLowPriority() {
  const threads = GmailApp.search('-label:' + LABEL_PRETRASH + ' AND (label:low_priority OR label:promos OR category:updates) -is:important -label:pinned -label:snoozed -label:done');
  if (threads.length === 0) return;
  Logger.log(LABEL_PRETRASH + ' Pretrashing ' + threads.length + ' low-priority threads.');
  markCleaned_();

  getOrCreateUserLabel(LABEL_PRETRASH).addToThreads(threads);
  GmailApp.moveThreadsToArchive(threads);
  stripAllLabelsExcept(threads, [LABEL_PRETRASH]);
  try { trackPretrashedBatch(threads.map(t => t.getId())); } catch (e) { console.log('trackPretrashedBatch failed: ' + e.toString()); }
}

function cleanPretrashLegacyLabels() {
  // One-shot, bucketed: enforce pretrash-only label on legacy pretrashed threads.
  // Re-run until the log shows 0.
  const threads = GmailApp.search('label:' + LABEL_PRETRASH, 0, MAX_THREADS_TAG);
  if (threads.length === 0) {
    Logger.log('No pretrashed threads with stale labels left.');
    return;
  }
  Logger.log('Stripping all non-pretrash labels from ' + threads.length + ' pretrashed threads.');
  stripAllLabelsExcept(threads, [LABEL_PRETRASH]);
}

function demoteFalseImportant() {
  const threads = GmailApp.search('is:important in:inbox -label:pinned -label:snoozed -is:starred -label:"' + LABEL_PUBLIC + '" -label:"' + LABEL_AUTOREPLY + '" -label:' + LABEL_PRETRASH);
  applyClassifierImportance_(threads, {
    fnName: 'demoteFalseImportant',
    gmailVerdict: VERDICT_KEEP,
    triggerVerdict: VERDICT_TRASH,
    emoji: '📉',
    applyFn: ts => GmailApp.markThreadsUnimportant(ts),
    llmActionType: TRACKING_TYPE_LLM_DEMOTED
  });
}

function promoteFalseUnimportant() {
  const threads = GmailApp.search('is:unimportant in:inbox -label:pinned -label:snoozed -label:done -label:"' + LABEL_AUTOREPLY + '" -label:' + LABEL_PRETRASH + ' newer_than:' + PROMOTE_LOOKBACK_DAYS + 'd');
  applyClassifierImportance_(threads, {
    fnName: 'promoteFalseUnimportant',
    gmailVerdict: VERDICT_TRASH,
    triggerVerdict: VERDICT_KEEP,
    emoji: '⭐',
    applyFn: ts => GmailApp.markThreadsImportant(ts),
    llmActionType: TRACKING_TYPE_LLM_PROMOTED
  });
}

function applyClassifierImportance_(threads, opts) {
  if (threads.length === 0) return;

  const tabs = getClassifierTabs();
  const trackingIndex = buildTrackingIndex(tabs.tracking.getDataRange().getValues());
  const classified = trackingIndex[TRACKING_TYPE_CLASSIFIED_IMPORTANCE];

  // Skip threads classified within the last CLASSIFIED_IMPORTANCE_TTL_DAYS; cuts repeat Gemini spend.
  const eligible = threads.filter(t => !classified[t.getId()]);
  if (eligible.length === 0) return;

  const features = buildThreadFeatures(eligible);
  const results = classifyFeatures(features);
  if (!results) return;

  const byId = {};
  results.forEach(r => byId[r.id] = r);

  const toAct = [];
  const classifiedIds = [];
  const decisionRows = [];
  const now = new Date().toISOString();

  features.forEach((f, i) => {
    const res = byId[f.id];
    if (!res) return;
    const llmVerdict = String(res.verdict || '').toLowerCase();
    const conf = Number(res.confidence) || 0;
    const shouldAct = !CLASSIFIER_SHADOW_MODE && llmVerdict === opts.triggerVerdict && conf >= CLASSIFIER_CONFIDENCE_THRESHOLD;
    const actor = shouldAct ? ACTOR_LLM : ACTOR_GMAIL;
    decisionRows.push([now, f.id, f.sender, f.subject, opts.fnName, opts.gmailVerdict, llmVerdict, conf, actor]);
    classifiedIds.push(f.id);
    if (shouldAct) toAct.push(eligible[i]);
  });

  try { appendRowsBatch(tabs.decisions, decisionRows); } catch (e) { console.log(opts.fnName + ' log: ' + e.toString()); }
  try { recordTrackingRows(classifiedIds, TRACKING_TYPE_CLASSIFIED_IMPORTANCE); } catch (e) { console.log(opts.fnName + ' track: ' + e.toString()); }

  if (toAct.length > 0) {
    markCleaned_();
    Logger.log(opts.emoji + ' ' + opts.fnName + ': ' + toAct.length + ' of ' + eligible.length + '.');
    opts.applyFn(toAct);
    if (opts.llmActionType) recordTrackingRows(toAct.map(t => t.getId()), opts.llmActionType);
    if (opts.llmActionType === TRACKING_TYPE_LLM_DEMOTED) cleanDemotedThreads(toAct, 'LLM-demoted');
  }
}

function deleteOlder() {
  const threads = GmailApp.search('label:' + LABEL_PRETRASH + ' older_than:' + PRETRASH_AGE_DAYS + 'd');
  if (threads.length === 0) return;
  Logger.log('🧹 Trashing ' + threads.length + ' expired pretrash threads.');
  markCleaned_();
  GmailApp.moveThreadsToTrash(threads);
}

function markPinnedAsImportant() {
  const threads = GmailApp.search('(label:pinned OR label:snoozed) is:unimportant');
  if (threads.length === 0) return;
  Logger.log('⭐ Promoting ' + threads.length + ' pinned threads.');
  markCleaned_();
  GmailApp.markThreadsImportant(threads);
}

function markTrashAsUnimportant() {
  const threads = GmailApp.search('in:trash is:important');
  if (threads.length === 0) return;
  Logger.log('📉 Demoting ' + threads.length + ' trashed importants.');
  markCleaned_();
  GmailApp.markThreadsUnimportant(threads);
}

function removeEmptyLabels() {
  const labels = GmailApp.getUserLabels();
  const limit = 50;
  let offset = parseInt(userProperties.getProperty(PROPS.OFFSET), 10);
  if (isNaN(offset) || offset >= labels.length) offset = 0;

  if (labels.length === 0) {
    Logger.log("No labels to process.");
  } else {
    const end = Math.min(offset + limit, labels.length);
    const filled = Math.min(10, Math.floor(end / labels.length * 10));
    Logger.log('🟩'.repeat(filled) + '⬜'.repeat(10 - filled) + ' ' + offset + '-' + end + ' / ' + labels.length);
  }

  let i;
  for (i = offset; i < offset + limit && i < labels.length; i++) {
    const name = labels[i].getName();
    if (PROTECTED_LABELS.includes(name)) continue;
    if (labels[i].getThreads().length === 0) {
      labels[i].deleteLabel();
      Logger.log('🏷️ Deleted empty label: ' + name);
      markCleaned_();
    }
  }
  userProperties.setProperty(PROPS.OFFSET, i);
}

function logCleanDate() {
  if (cleanedInCurrentIteration) {
    userProperties.setProperty(PROPS.LAST_CLEANED_TIME, lastCleanedTime);
  } else {
    console.log("✨ All clean since " + lastCleanedTime);
  }
}

function removeAllLabels() {
  const threads = GmailApp.search('-has:nouserlabels', 0, 25);
  for (let i = 0; i < threads.length; i++) {
    const labels = threads[i].getLabels();
    for (let k = 0; k < labels.length; k++) {
      threads[i].removeLabel(labels[k]);
    }
  }
}
