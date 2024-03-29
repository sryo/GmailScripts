/* 
Script that schedules unimportant mails for deletion and other general cleanup routines.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

var userProperties = PropertiesService.getUserProperties();
var lastCleanedTime = userProperties.getProperty('lastCleanedTime');
if (lastCleanedTime == null) {
  lastCleanedTime = new Date(); // initialize with current time
  userProperties.setProperty('lastCleanedTime', lastCleanedTime);
}
var cleanedInCurrentIteration = false; // keep track of whether labels were added in current iteration

function cleanUp() {
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
    lastCleanedTime = new Date(); // update last label added time

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
    lastCleanedTime = new Date(); // update last label added time

    // Mark the emails as read
    for (var i = 0; i < threads.length; i++) {
      threads[i].markRead();
    }
  }
}

// Set the label to use for threads that should be deleted after 30 days
var labelName = '🗑️';

function preTrashLowPriority() {
  // Search for unimportant emails
  var threads = GmailApp.search('-label:labelName AND label:low_priority OR label:promos OR category:updates -is:important -label:pinned -label:snoozed -label:done');
  if (threads.length > 0) {
    Logger.log('🗑️ Found ' + threads.length + ' low priority threads.');
    cleanedInCurrentIteration = true;
    lastCleanedTime = new Date(); // update last label added time

    // Get the label with the specified name, or create it if it does not exist
    var label = GmailApp.getUserLabelByName(labelName);
    if (label == null) {
      label = GmailApp.createLabel(labelName);
    }

    // Remove any existing labels from the threads
    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      var labels = thread.getLabels();
      for (var j = 0; j < labels.length; j++) {
        thread.removeLabel(labels[j]);
      }
    }

    // Add the specified label to the threads and archive
    for (var i = 0; i < threads.length; i++) {
      threads[i].addLabel(label);
      threads[i].moveToArchive();
    }
  }
}

function deleteOlder() {
  // Search for emails that have the specified label and are more than 20 days old
  var threads = GmailApp.search('label:' + labelName + ' older_than:20d');
  if (threads.length > 0) {
    Logger.log('🧹 Found ' + threads.length + ' threads to delete.');
    cleanedInCurrentIteration = true;
    lastCleanedTime = new Date(); // update last label added time

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
    lastCleanedTime = new Date(); // update last label added time

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
    lastCleanedTime = new Date(); // update last label added time

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
  // convert offset from string to number
  offset = offset++;

  if (labels.length > 0) {
    var progress = "";
    var percentage = Math.floor((offset + limit) / labels.length * 10);
    for (var j = 0; j < percentage; j++) {
      progress += "🟩";
    }
    for (var j = percentage; j < 10; j++) {
      if (j + 1 == Math.floor((offset + limit * 2) / labels.length * 10)) {
        progress += "🟦";
      } else {
        progress += "⬜";
      }
    }
    progress += " Current Offset: " + offset + "/" + labels.length + ". Next:" + (offset + limit);
    Logger.log(progress);
  } else {
    Logger.log("The labels list is empty.");
  }

  for (var i = offset; i < offset + limit && i < labels.length; i++) {
    var threads = labels[i].getThreads();
    if (threads == "") {
      labels[i].deleteLabel();
      Logger.log("🏷️ Deleted empty label: " + labels[i].getName());
      cleanedInCurrentIteration = true;
      lastCleanedTime = new Date(); // update last label added time
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
