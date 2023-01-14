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
  var html = "<html><head><title>Public Threads</title><style>body {margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;} h1 {font-size: 36px; font-weight: bold;} p {font-size: 18px; line-height: 1.5;} a {color: inherit;} .mail-subject:hover a {opacity: 1;} .mail-subject a {text-decoration: none; opacity: 0; transition: opacity 0.25s;}</style></head><body>";
  for (var i = 0; i < threadArray.length; i++) {
    var thread = threadArray[i];
    for (var j = 0; j < thread.messages.length; j++) {
      var message = thread.messages[j];
      html += "<h2 class='mail-subject'>" + message.subject + " <a href='mailto:" + message.from + "?subject=RE: " + message.subject + "'>🗩</a></h2>";
      html += "<p>" + message.body + "</p>";
    }
  }
  html += "</body></html>";
  Logger.log("Showing " + threadArray.length + " threads with " + threadArray.length + " messages");
  return html;
}

// 4. Publish the HTML file as a web app and make it publicly accessible.

function publishPublicThreads() {
  var labelName = '🌎';
  if (!GmailApp.getUserLabelByName(labelName)) {
    GmailApp.createLabel(labelName);
  }
  var html = writeThreadsToHtml(getThreadsInLabel(labelName));
  var output = HtmlService.createHtmlOutput(html);
  output.setTitle("Public Threads");
  output.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  output.setSandboxMode(HtmlService.SandboxMode.IFRAME);
  output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  return output;
}

function doGet() {
  return publishPublicThreads();
}
