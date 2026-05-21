/*
Fast pass: labels, archives, ping, stash.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function cleanUp() {
  initCleanRun_();

  markDoneAsRead();
  markPinnedAsImportant();
  salvagePretrashOnSignals_();
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

function archiveInbox() {
  const threads = GmailApp.search('label:inbox is:read older_than:' + ARCHIVE_INBOX_AGE_DAYS + 'd -label:pinned -label:snoozed -label:"' + LABEL_PING + '" -label:"' + LABEL_AUTOREPLY + '"');
  if (threads.length === 0) return;
  Logger.log('📦 Archiving ' + threads.length + ' read threads.');
  markCleaned_();
  GmailApp.moveThreadsToArchive(threads);
}

function ping() {
  const pinged = buildSimpleTrackingIndex_(TRACKING_TYPE_PINGED);
  const threads = GmailApp.search('is:read older_than:' + PING_PICKUP_DAYS + 'd newer_than:' + PING_EXPIRE_DAYS + 'd -label:sent -label:done -label:pinned -label:snoozed -label:"' + LABEL_PING + '" -label:' + LABEL_PRETRASH + ' -label:"' + LABEL_AUTOREPLY + '" -label:"' + LABEL_STASH + '" -in:trash');
  const candidates = threads.filter(t => t.getMessageCount() === 1 && !pinged[t.getId()]);
  if (candidates.length === 0) return;
  Logger.log(LABEL_PING + ' Pinging ' + candidates.length + ' forgotten reads.');
  markCleaned_();
  getOrCreateUserLabel(LABEL_PING).addToThreads(candidates);
  getOrCreateUserLabel(LABEL_AUTOREPLY).addToThreads(candidates);
  applyPingTo_(candidates);
}

function salvagePretrashOnSignals_() {
  // Documented contract: star, important, reply, 🦾, ↩️ all signal KEEP.
  // Strip 🗑️ as soon as any of those appear so deleteOlder doesn't trash a thread the user revived.
  // label:sent (not from:me) — from:me false-matches forwarded mail from Send-As aliases.
  const threads = GmailApp.search('label:' + LABEL_PRETRASH + ' (is:starred OR is:important OR label:sent OR label:"' + LABEL_AUTOREPLY + '" OR label:"' + LABEL_PING + '")');
  if (threads.length === 0) return;
  Logger.log(LABEL_PRETRASH + ' Salvaging ' + threads.length + ' pretrashed threads with KEEP signals.');
  threads.forEach(t => {
    const reasons = [];
    const labels = t.getLabels().map(l => l.getName());
    if (labels.indexOf(LABEL_AUTOREPLY) >= 0) reasons.push('🦾');
    if (labels.indexOf(LABEL_PING) >= 0) reasons.push('↩️');
    if (t.isImportant()) reasons.push('important');
    if (t.getMessages().some(m => m.isStarred())) reasons.push('starred');
    if (reasons.length === 0) reasons.push('replied');
    Logger.log('  • [' + reasons.join(',') + '] ' + t.getFirstMessageSubject());
  });
  markCleaned_();
  removeLabelIfExists_(LABEL_PRETRASH, threads);
}

function syncManualPings_() {
  // Detects threads the user labeled ↩️ themselves and treats them like an auto-ping.
  // If the thread also carries 🗑️, strip pretrash: applying ↩️ is a stronger salvage signal.
  const pinged = buildSimpleTrackingIndex_(TRACKING_TYPE_PINGED);
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
  getOrCreateUserLabel(LABEL_AUTOREPLY).addToThreads(untracked);
  applyPingTo_(untracked);
}

function applyPingTo_(threads) {
  if (!threads || threads.length === 0) return;
  GmailApp.moveThreadsToInbox(threads);
  safely_('ping track', () => recordTrackingRows(threads.map(t => t.getId()), TRACKING_TYPE_PINGED));
}

function archiveDismissedPings_() {
  // Dismissal contract: the user removes the ↩️ label to dismiss a ping. We never strip the label
  // ourselves; its absence is the gesture. Tracking row stays after dismissal as a permanent
  // "already pinged" marker so ping() won't resurface the same thread twice.
  const pinged = buildSimpleTrackingIndex_(TRACKING_TYPE_PINGED);
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
  removeLabelIfExists_(LABEL_AUTOREPLY, toArchive);
  GmailApp.moveThreadsToArchive(toArchive);
}

function archiveStalePings_() {
  // Passive dismissal: a pinged thread that aged past PING_EXPIRE_DAYS without you acting.
  // Remove ping and riff labels so the thread is fully reset.
  const threads = GmailApp.search('label:"' + LABEL_PING + '" in:inbox older_than:' + PING_EXPIRE_DAYS + 'd');
  if (threads.length === 0) return;
  Logger.log('📦 Archiving ' + threads.length + ' stale pings.');
  markCleaned_();
  removeLabelIfExists_(LABEL_PING, threads);
  removeLabelIfExists_(LABEL_AUTOREPLY, threads);
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
  const threads = GmailApp.search('-label:' + LABEL_PRETRASH + ' AND (label:low_priority OR label:promos OR category:updates) -is:important -label:pinned -label:snoozed -label:done -is:starred -label:sent -label:"' + LABEL_AUTOREPLY + '" -label:"' + LABEL_PING + '"');
  if (threads.length === 0) return;
  Logger.log(LABEL_PRETRASH + ' Pretrashing ' + threads.length + ' low-priority threads.');
  markCleaned_();

  getOrCreateUserLabel(LABEL_PRETRASH).addToThreads(threads);
  GmailApp.moveThreadsToArchive(threads);
  stripAllLabelsExcept(threads, [LABEL_PRETRASH]);
  safely_('recordPretrashObservations', () => recordPretrashObservations(threads));
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
