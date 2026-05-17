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
  markDoneAsRead();
  markPinnedAsImportant();
  deleteOlder();
  preTrashLowPriority();
  markTrashAsUnimportant();
  archiveInbox();
  logCleanDate();
}

function markCleaned_() {
  cleanedInCurrentIteration = true;
  lastCleanedTime = new Date().toISOString();
}

function archiveInbox() {
  const threads = GmailApp.search('label:inbox is:read older_than:1d -label:pinned -label:snoozed');
  if (threads.length === 0) return;
  Logger.log('📦 Found ' + threads.length + ' threads to move to archive.');
  markCleaned_();
  GmailApp.moveThreadsToArchive(threads);
}

function markDoneAsRead() {
  const threads = GmailApp.search('label:done is:unread -label:pinned -label:snoozed');
  if (threads.length === 0) return;
  Logger.log('📖 Found ' + threads.length + ' threads to mark as read.');
  markCleaned_();
  GmailApp.markThreadsRead(threads);
}

function preTrashLowPriority() {
  const threads = GmailApp.search('-label:' + LABEL_PRETRASH + ' AND (label:low_priority OR label:promos OR category:updates) -is:important -label:pinned -label:snoozed -label:done');
  if (threads.length === 0) return;
  Logger.log('🗑️ Found ' + threads.length + ' low priority threads.');
  markCleaned_();

  withClassifier(threads, CLASSIFIER_MODE_TRASH, 'preTrashLowPriority', VERDICT_TRASH, ts => {
    getOrCreateUserLabel(LABEL_PRETRASH).addToThreads(ts);
    GmailApp.moveThreadsToArchive(ts);
    try { trackPretrashedBatch(ts.map(t => t.getId())); } catch (e) { console.log('trackPretrashedBatch failed: ' + e.toString()); }
  });
}

function deleteOlder() {
  const threads = GmailApp.search('label:' + LABEL_PRETRASH + ' older_than:20d');
  if (threads.length === 0) return;
  Logger.log('🧹 Found ' + threads.length + ' threads to delete.');
  markCleaned_();
  GmailApp.moveThreadsToTrash(threads);
}

function markPinnedAsImportant() {
  const threads = GmailApp.search('(label:pinned OR label:snoozed) is:unimportant');
  if (threads.length === 0) return;
  Logger.log('⭐ Found ' + threads.length + ' important threads.');
  markCleaned_();

  withClassifier(threads, CLASSIFIER_MODE_PINNED, 'markPinnedAsImportant', VERDICT_KEEP, ts => {
    GmailApp.markThreadsImportant(ts);
  });
}

function markTrashAsUnimportant() {
  const threads = GmailApp.search('in:trash is:important');
  if (threads.length === 0) return;
  Logger.log('📉 Found ' + threads.length + ' important threads in trash.');
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
    if (labels[i].getThreads().length === 0) {
      labels[i].deleteLabel();
      Logger.log("🏷️ Deleted empty label: " + labels[i].getName());
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
