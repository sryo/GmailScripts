/* 
This is a Google Apps Script that automatically replies to emails in your Gmail inbox.
The script searches for keywords in the email threads and then replies with a pre-determined
phrase that is associated with the keyword. 
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function replyToEmails() {
  // Get the list of keywords and replies from the Google Spreadsheet
  var sheet = SpreadsheetApp.getActiveSheet();
  sheet.setFrozenRows(1); // Freeze the first row in the sheet

  // Set the headers for the three columns
  var headers = ["Keyword", "Phrase", "Count"];
  for (var i = 0; i < headers.length; i++) {
    var cell = sheet.getRange(1, i + 1);
    cell.setValue(headers[i]);
  }

  var dataRange = sheet.getDataRange();
  var keywords = dataRange.getValues();

  // Loop through all unread threads in the inbox
  var threads = GmailApp.search("is:unread in:inbox");
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];

    // Get the list of messages in the thread
    var messages = thread.getMessages();

    // Create a new body variable to store the phrases that match the keywords
    var body = '';

    // Loop through the keywords to see if any of them appear in the thread
    for (var k = 0; k < keywords.length; k++) {
      // Loop through the messages to see if the keyword appears in the body of any of them
      for (var j = 0; j < messages.length; j++) {
        var message = messages[j];

        // Check if the keyword appears in the body of the message
        var keyword = keywords[k][0];
        var terms = keyword.split(" OR "); // Split the keyword on the " OR " divider

        var notFound = false;
        var skipFound = false;
        var orFound = false;

        if (keyword.indexOf("NOT ") >= 0) {
          // If the keyword contains "NOT"
          var notTerm = keyword.match(/NOT (.*)/)[1]; // Get the term that should not appear in the body
          if (message.getPlainBody().indexOf(notTerm) >= 0) {
            // If the keyword appears in the body of the message, do not add the phrase to the body variable.
            notFound = false;
          } else {
            // If the keyword does not appear in the body of the message, add the phrase to the body variable.
            notFound = true;            
          }
        }

        if (keyword.indexOf("SKIP") >= 0) {
          // If the keyword contains "SKIP"
          var skip = keyword.match(/SKIP(\d+)/)[1]; // Get the number of words that the keyword should appear within
          if (skip) {
            skip = skip;
          } else {
            skip = 0;
          }

          keyword = keyword.replace("SKIP" + skip, ""); // Remove the "SKIP<number>" from the keyword
          var otherTerm = keyword.trim().split(" ")[1]; // Get the term that should appear within the specified number of words of the original term
          var term = otherTerm.split(" ")[0]; // Get the first term in the keyword
          var otherTermIndex = message.getPlainBody().indexOf(otherTerm); // Get the index of the other term in the body
          var termIndex = message.getPlainBody().indexOf(term); // Get the index of the original term in the body
          if (otherTermIndex >= 0 && termIndex >= 0 && Math.abs(otherTermIndex - termIndex) <= skip) { // Check if the distance between the two terms is less than or equal to the specified number of words
            // If the keyword appears within the specified number of words of the other term, add the phrase to the body variable
            skipFound = true;

          }
        }

        // Loop through the individual terms and check if any of them appear in the body.
        // If any of the terms appear in the body, add the phrase to the body variable.
        for (var t = 0; t < terms.length; t++) {
          if (message.getPlainBody().indexOf(terms[t].trim()) >= 0) {
            orFound = true;
          }
        }

        if (notFound || skipFound || orFound) {
          // Get the corresponding phrase from the keywords variable
          var phrase = keywords[k][1];

          // Add the phrase to the body variable
          body += phrase + '\n';

          // Log the keyword that was found
          Logger.log('Found keyword: ' + keywords[k][0]);

          // Increment the value in the third column for the keyword that was found
          var row = k + 1; // get the row number of the keyword from the k variable
          var cell = sheet.getRange(row, 3); // get the cell in the third column for the keyword
          var currentValue = cell.getValue(); // get the current value of the cell
          cell.setValue(currentValue + 1); // set the new value of the cell to the current value plus 1
          break;
        }
      }
    }

    // Create a new draft reply and add the body to the thread
    thread.createDraftReply(body);
    // Get the label with the specified name, or create it if it does not exist
    var labelName = '🤖';
    var label = GmailApp.getUserLabelByName(labelName);
    if (label == null) {
      label = GmailApp.createLabel(labelName);
    }
    thread.addLabel(label);

    // Log the reply
    Logger.log('Replied in the thread with subject: ' + thread.getFirstMessageSubject() + ' - See ' + thread.getPermalink());
  }
}
