/* 
Script that groups mails by domain, like Hey
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function tagEmailsByDomain() {
  // Get all emails in the inbox
  var threads = GmailApp.search('has:nouserlabels', 0, 25);

  // Loop through each email thread
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();

    // Loop through each email in the thread
    for (var j = 0; j < messages.length; j++) {
      var sender = messages[j].getFrom();

      // Extract the domain from the sender's email address
      var match = sender.match(/@([^@.]+)\.[^@]+$/);
      if (match != null) {
        var domain = match[1];

        // Check if the label already exists
        var label = GmailApp.getUserLabelByName(domain);
        if (label == null) {
          // Create the label if it doesn't exist
          label = GmailApp.createLabel(domain);
          listLabelHide(domain);
        }
        label.addToThread(threads[i]);
      }
    }
  }
}
