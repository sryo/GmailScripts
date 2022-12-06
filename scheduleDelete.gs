
function deleteLowPriority() {
  // Set the label to use for threads that should be deleted after 30 days
  var labelName = '🗑️';

  // Search for emails that match the specified criteria
  var threads = GmailApp.search('-label:🗑️ AND label:low_priority OR label:promos -label:pinned -label:snoozed -label:done');
  Logger.log('Found ' + threads.length + ' low priority threads.');

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

  // Search for emails that have the specified label and are more than 20 days old
  var threadsToDelete = GmailApp.search('label:' + labelName + ' older_than:20d');
  Logger.log('Found ' + threadsToDelete.length + ' threads to delete.');

  // Delete the threads
  for (var i = 0; i < threadsToDelete.length; i++) {
    threadsToDelete[i].moveToTrash();
  }
}
