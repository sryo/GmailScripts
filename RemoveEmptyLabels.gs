/* 
Script that removes unused labels in Gmail.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function RemoveEmptyLabels() {
  var labels = GmailApp.getUserLabels();
  var limit = 25;
  var userProperties = PropertiesService.getUserProperties();
  var offset = userProperties.getProperty('offset');
  if (offset == null || offset >= labels.length) {
   offset = 0;
  }
  // convert offset from string to number
  offset = offset++;
  for (var i = offset; i < offset+limit && i < labels.length-1; i++) {
   var threads = labels[i].getThreads();
    if (threads == "") {
      labels[i].deleteLabel();
    }
  }
  userProperties.setProperty('offset', i);
}
