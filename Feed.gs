function getUnreadEmails() {
  return GmailApp.getInboxUnreadCount();
}


function doGet() {
  return HtmlService
      .createTemplateFromFile('FeedTemplate')
      .evaluate();
}
