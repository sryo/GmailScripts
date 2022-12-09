/* 
This is a Google Apps Script creates a file in Google Drive containing all the
threads in the 🌎 label and shares it with the world.
Author: Mateo Yadarola (teodalton@gmail.com)
*/


// 1. Enable the Gmail API in your Google Developers Console.
//    https://console.developers.google.com/apis/library/gmail.googleapis.com

// 2. Use the Gmail API to get a list of threads in the label you want to display.

function getThreadsInLabel(labelName) {
  var threads = GmailApp.getUserLabelByName(labelName).getThreads(0, 100);
  var threadArray = [];
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    var messageArray = [];
    for (var j = 0; j < messages.length; j++) {
      messageArray.push({
        id: messages[j].getId(),
        subject: messages[j].getSubject(),
        body: messages[j].getBody(),
        from: messages[j].getFrom()
      });
    }
    threadArray.push({
      id: threads[i].getId(),
      messages: messageArray
    });
  }
  return threadArray;
}

// 3. Use Google Apps Script to create a new HTML file and write the thread information to it.

function writeThreadsToHtml(threadArray) {
  var html = "<html><head><title>Public Threads</title><style>body {font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; line-height: 1.5; color: #4a4a4a; background-color: #fff; margin: 0; padding: 0;} h2 {font-size: 24px; font-weight: 500; margin: 0; padding: 0;} p {margin: 0; padding: 0;}</style></head><body>";
  for (var i = 0; i < threadArray.length; i++) {
    var thread = threadArray[i];
    for (var j = 0; j < thread.messages.length; j++) {
      var message = thread.messages[j];
      html += "<h2>" + message.subject + " <a href='mailto:" + message.from + "?subject=RE: " + message.subject + "'>🗩</a></h2>";
      html += "<p>" + message.body + "</p>";
    }
  }
  html += "</body></html>";
  Logger.log(html);
  return html;
}

// 4. Publish the HTML file as a web app and make it publicly accessible.

function publishPublicThreads() {
  var labelName = '🌎';
  if (!GmailApp.getUserLabelByName(labelName)) {
    GmailApp.createLabel(labelName);
  }
  // Replace [SCRIPT_ID] with the actual script ID for your Google Script
  var SCRIPT_ID = "";
  var url = "https://script.google.com/macros/s/" + SCRIPT_ID + "/exec";
  var html = writeThreadsToHtml(getThreadsInLabel(labelName));
  var output = HtmlService.createHtmlOutput(html);
  output.setTitle("Public Threads");
  output.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  output.setSandboxMode(HtmlService.SandboxMode.IFRAME);
  
  Logger.log(output);
  return output;
}

function doGet() {
  return publishPublicThreads();
}
