/* 
Script that groups mails by sender name
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function LabelBySender() {
var threads = GmailApp.search('has:nouserlabels', 0, 25);
var messages = GmailApp.getMessagesForThreads(threads);
  for (var i = 0 ; i < messages.length; i++) {
    for (var j = 0; j < messages[i].length; j++) {
      var senderName = {};
      var sender = messages[i][j].getFrom().replace(/"/g,'').replace(/ \([\s\S]*?\)/g, '').split(/\s+/);
      if (sender.length > 1) {
        sender.pop();
        senderName = sender.join(" ");
      }
      else {
      senderName = sender
      }
      var label = GmailApp.getUserLabelByName(senderName);
  
      if (label == null) {
        var label = GmailApp.createLabel(senderName);
        listLabelHide(senderName);
      }
      label.addToThread(threads[i]);
    }
  }
}


function RemoveEmptyLabels() {
  var labels = GmailApp.getUserLabels();
  var limit = 30;
  var userProperties = PropertiesService.getUserProperties();
  var offset = userProperties.getProperty('offset');
  if (offset == null || offset >= labels.length) {
   offset = 0;   
  }
  Logger.log(offset);
  // convert offset from string to number
  offset = offset++;
  for (var i = offset; i < offset+limit && i < labels.length; i++) {
   var threads = labels[i].getThreads();
    if (threads == "") {
      labels[i].deleteLabel();
    }
  }
  userProperties.setProperty('offset', i);
}


function logLabels() {
  var labels = GmailApp.getUserLabels();
  for (var i = 0; i < labels.length; i++) {
     Logger.log(i+labels[i].getName());
  }  
}


function listLabelHide(labelName) {
  var response =
    Gmail.Users.Labels.list('me');
  for (var i = 0; i < response.labels.length; i++) {
    var label = response.labels[i]
    if (label.name == labelName)
    Logger.log(label.id);
    Gmail.Users.Labels.update({
    'labelListVisibility': 'labelHide'
  }, 'me', label.id);
  }
}
