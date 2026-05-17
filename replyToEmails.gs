/*
Auto-replies to Gmail threads based on keyword matches in a spreadsheet.
Author: Mateo Yadarola (teodalton@gmail.com)

Spreadsheet columns: Keyword | Phrase | Count
Keyword syntax:
  foo              fires when body contains "foo"
  foo OR bar       fires when body contains "foo" or "bar"
  NOT foo          fires when body does NOT contain "foo"
*/

function setupReplySheet() {
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.setFrozenRows(1);
  const headers = ["Keyword", "Phrase", "Count"];
  for (let i = 0; i < headers.length; i++) {
    sheet.getRange(1, i + 1).setValue(headers[i]);
  }
}

function replyToEmails() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const keywords = sheet.getDataRange().getValues().slice(1);
  if (keywords.length === 0) {
    Logger.log('No keywords configured.');
    return;
  }

  let label = GmailApp.getUserLabelByName(LABEL_AUTOREPLY);
  if (!label) label = GmailApp.createLabel(LABEL_AUTOREPLY);

  const threads = GmailApp.search('is:unread in:inbox -label:' + LABEL_AUTOREPLY);
  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const messages = thread.getMessages();
    let body = '';
    const matchedKeywords = {};

    for (let j = 0; j < messages.length; j++) {
      const plain = messages[j].getPlainBody();

      for (let k = 0; k < keywords.length; k++) {
        if (matchedKeywords[k]) continue;
        const keyword = keywords[k][0];
        if (!keyword) continue;
        const phrase = keywords[k][1];

        let matched = false;
        const notMatch = keyword.match(/^NOT\s+(.+)$/);
        if (notMatch) {
          if (plain.indexOf(notMatch[1]) < 0) matched = true;
        } else {
          const terms = keyword.split(" OR ");
          for (let t = 0; t < terms.length; t++) {
            if (plain.indexOf(terms[t].trim()) >= 0) {
              matched = true;
              break;
            }
          }
        }

        if (matched) {
          matchedKeywords[k] = true;
          body += phrase + '\n';
          Logger.log('Found keyword: ' + keyword);
          const cell = sheet.getRange(k + 2, 3);
          cell.setValue((cell.getValue() || 0) + 1);
        }
      }
    }

    if (body) {
      thread.createDraftReply(body);
      thread.addLabel(label);
      Logger.log('Replied in thread with subject: ' + thread.getFirstMessageSubject() + ' - ' + thread.getPermalink());
    }
  }
}
