/* 
Script that groups mails by sender name.
Works best if you set each label as a bundle in Google Inbox.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function LabelBySender() {
var threads = GmailApp.search('has:nouserlabels', 0, 25);
var messages = GmailApp.getMessagesForThreads(threads);
  for (var i = 0 ; i < messages.length; i++) {
    for (var j = 0; j < messages[i].length; j++) {
      var senderName = {};
      var sender = messages[i][j].getFrom().split(/\s+/);
      if (sender.length > 1) {
        sender.pop();
        senderName = sender.join(" ");
      }
      var label = GmailApp.getUserLabelByName(senderName);
  
      if (label == null) {
        var label = GmailApp.createLabel(senderName);
      }
      label.addToThread(threads[i]);
    }
  }
}
