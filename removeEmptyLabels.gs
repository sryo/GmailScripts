
/* 
Script that deletes unused labels in batches
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function removeEmptyLabels() {
  var labels = GmailApp.getUserLabels();
  var limit = 30;
  var userProperties = PropertiesService.getUserProperties();
  var offset = userProperties.getProperty('offset');
  if (offset == null || offset >= labels.length) {
    offset = 0;
  }
  // convert offset from string to number
  offset = offset++;
  Logger.log("Current offset: " + offset + "/" + labels.length + " (total)");

  for (var i = offset; i < offset + limit && i < labels.length; i++) {
    var threads = labels[i].getThreads();
    if (threads == "") {
      labels[i].deleteLabel();
      Logger.log("Deleted empty label: " + labels[i].getName());
    }
  }
  userProperties.setProperty('offset', i);
  Logger.log("Next offset: " + i);
}
