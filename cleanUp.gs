/* 
Script that schedules unimportant mails for deletion and other general cleanup routines.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

var userProperties = PropertiesService.getUserProperties();
var lastCleanedTime = userProperties.getProperty('lastCleanedTime');
if (lastCleanedTime == null) {
  lastCleanedTime = new Date().toISOString();
  userProperties.setProperty('lastCleanedTime', lastCleanedTime);
}
var cleanedInCurrentIteration = false; // keep track of whether labels were added in current iteration

function cleanUp() {
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

function archiveInbox() {
  // Search for read emails in the inbox
  var threads = GmailApp.search('label:inbox is:read older_than:1d -label:pinned -label:snoozed');
  if (threads.length > 0) {
    Logger.log('📦 Found ' + threads.length + ' threads to move to archive.');
    cleanedInCurrentIteration = true;
    lastCleanedTime = new Date().toISOString();

    // Move the emails to archive
    for (var i = 0; i < threads.length; i++) {
      threads[i].moveToArchive();
    }
  }
}

function markDoneAsRead() {
  // Search for done unread mails
  var threads = GmailApp.search('label:done is:unread -label:pinned -label:snoozed');
  if (threads.length > 0) {
    Logger.log('📖 Found ' + threads.length + ' threads to mark as read.');
    cleanedInCurrentIteration = true;
    lastCleanedTime = new Date().toISOString();

    // Mark the emails as read
    for (var i = 0; i < threads.length; i++) {
      threads[i].markRead();
    }
  }
}

function preTrashLowPriority() {
  var threads = GmailApp.search('-label:' + LABEL_PRETRASH + ' AND (label:low_priority OR label:promos OR category:updates) -is:important -label:pinned -label:snoozed -label:done');
  if (threads.length > 0) {
    Logger.log('🗑️ Found ' + threads.length + ' low priority threads.');
    cleanedInCurrentIteration = true;
    lastCleanedTime = new Date().toISOString();

    logDecisions(threads, CLASSIFIER_MODE_TRASH, 'preTrashLowPriority', VERDICT_TRASH);

    var label = GmailApp.getUserLabelByName(LABEL_PRETRASH);
    if (label == null) label = GmailApp.createLabel(LABEL_PRETRASH);

    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      var existing = thread.getLabels();
      for (var j = 0; j < existing.length; j++) thread.removeLabel(existing[j]);
    }

    var pretrashedIds = [];
    for (var i = 0; i < threads.length; i++) {
      threads[i].addLabel(label);
      threads[i].moveToArchive();
      pretrashedIds.push(threads[i].getId());
    }
    try { trackPretrashedBatch(pretrashedIds); } catch (e) { console.log('trackPretrashedBatch failed: ' + e.toString()); }
  }
}

function deleteOlder() {
  var threads = GmailApp.search('label:' + LABEL_PRETRASH + ' older_than:20d');
  if (threads.length > 0) {
    Logger.log('🧹 Found ' + threads.length + ' threads to delete.');
    cleanedInCurrentIteration = true;
    lastCleanedTime = new Date().toISOString();

    // Delete the threads
    for (var i = 0; i < threads.length; i++) {
      threads[i].moveToTrash();
    }
  }
}

function markPinnedAsImportant() {
  var threads = GmailApp.search('label:pinned OR label:snoozed is:unimportant');
  if (threads.length > 0) {
    Logger.log('⭐ Found ' + threads.length + ' important threads.');
    cleanedInCurrentIteration = true;
    lastCleanedTime = new Date().toISOString();

    logDecisions(threads, CLASSIFIER_MODE_PINNED, 'markPinnedAsImportant', VERDICT_KEEP);

    // Mark the emails as important
    for (var i = 0; i < threads.length; i++) {
      threads[i].markImportant();
    }
  }
}

function markTrashAsUnimportant() {
  var threads = GmailApp.search('in:trash is:important ');
  if (threads.length > 0) {
    Logger.log('📉 Found ' + threads.length + ' important threads in trash.');
    cleanedInCurrentIteration = true;
    lastCleanedTime = new Date().toISOString();

    // Mark the emails as not important
    for (var i = 0; i < threads.length; i++) {
      threads[i].markUnimportant();
    }
  }
}

function removeEmptyLabels() {
  //  Delete unused labels in batches
  var labels = GmailApp.getUserLabels();
  var limit = 50;
  var userProperties = PropertiesService.getUserProperties();
  var offset = userProperties.getProperty('offset');
  if (offset == null || offset >= labels.length) {
    offset = 0;
  }
  offset = parseInt(offset);

  if (labels.length === 0) {
    Logger.log("No labels to process.");
  } else {
    var end = Math.min(offset + limit, labels.length);
    var filled = Math.min(10, Math.round(end / labels.length * 10));
    Logger.log('🟩'.repeat(filled) + '⬜'.repeat(10 - filled) + ' ' + offset + '-' + end + ' / ' + labels.length);
  }

  for (var i = offset; i < offset + limit && i < labels.length; i++) {
    var threads = labels[i].getThreads();
    if (threads.length === 0) {
      labels[i].deleteLabel();
      Logger.log("🏷️ Deleted empty label: " + labels[i].getName());
      cleanedInCurrentIteration = true;
      lastCleanedTime = new Date().toISOString();
    }
  }
  userProperties.setProperty('offset', i);
}

function logCleanDate() {
  if (cleanedInCurrentIteration) {
    userProperties.setProperty('lastCleanedTime', lastCleanedTime);
  }
  else {
    console.log("✨ All clean since " + userProperties.getProperty('lastCleanedTime'));
  }
}

function removeAllLabels() {
  // Get all emails in the inbox
  var threads = GmailApp.search('-has:nouserlabels', 0, 25);

  // Loop through each email thread
  for (var i = 0; i < threads.length; i++) {
    var labels = threads[i].getLabels();

    // Loop through each label and remove it from the email
    for (var k = 0; k < labels.length; k++) {
      threads[i].removeLabel(labels[k]);
    }
  }
}
