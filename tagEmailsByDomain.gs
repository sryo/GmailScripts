/* 
Script that groups mails by domain, like Hey bundles.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function tagEmailsByDomain() {
  var pageToken;
  do {
    var threads = Gmail.Users.Threads.list('me', { q: 'has:nouserlabels', maxResults: 25, pageToken });
    if (threads.threads && threads.threads.length) {
      for (var i = 0; i < threads.threads.length; i++) {
        var messages = Gmail.Users.Threads.get('me', threads.threads[i].id).messages;
        for (var j = 0; j < messages.length; j++) {
          var sender = messages[j].payload.headers.find(header => header.name === 'From').value;
          var match = sender.match(/@([^@.]+)/);
          if (match == null) {
            console.log("Could not extract domain from message in thread: " + threads.threads[i].id);
          } else {
            var domain = match[1];
            var label = Gmail.Users.Labels.list('me', { q: `name='${domain}'` }).labels.find(label => label.name === domain);
            if (!label) {
              label = Gmail.Users.Labels.create({ name: domain, labelListVisibility: 'labelHide' }, 'me');
            }
            Gmail.Users.Threads.modify({ addLabelIds: [label.id] }, 'me', threads.threads[i].id);
            var senderName = sender.match(/^([^<]*)</)[1].trim();
            console.log(`Added label '${domain}' to thread ${threads.threads[i].id} from '${senderName}'`);
          }
        }
      }
    }
    pageToken = threads.nextPageToken;
  } while (pageToken);
}
