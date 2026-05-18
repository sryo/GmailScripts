/*
Share Gmail threads labeled LABEL_PUBLIC as a web page.
Author: Mateo Yadarola (teodalton@gmail.com)

Deployment: must be deployed as "Execute as: me" with access "Anyone with the link" at most.
NEVER deploy as "Anyone, even anonymous"; that exposes every 🌎-labeled thread to the open internet.
*/

function getThreadsInLabel(labelName) {
  try {
    const label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      console.log(`Label "${labelName}" not found.`);
      return [];
    }

    const threads = label.getThreads(0, MAX_THREADS_PUBLISH);
    const messagesByThread = GmailApp.getMessagesForThreads(threads);

    return threads.map((thread, idx) => {
      try {
        const messages = messagesByThread[idx] || [];
        return {
          id: thread.getId(),
          subject: thread.getFirstMessageSubject() || '(No subject)',
          lastMessageDate: thread.getLastMessageDate().toISOString(),
          messages: messages.map(message => ({
            id: message.getId(),
            subject: message.getSubject(),
            body: message.getBody(),
            from: message.getFrom(),
            date: message.getDate().toISOString()
          }))
        };
      } catch (e) {
        console.error(`Failed to process thread: ${e.toString()}`);
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    console.error(`Failed to get threads: ${e.toString()}`);
    return [];
  }
}

function writeThreadsToHtml(threadArray) {
  const messageCount = threadArray.reduce((count, thread) => count + thread.messages.length, 0);
  console.log(`Showing ${threadArray.length} threads with ${messageCount} messages`);

  const threadHtml = threadArray.map(thread => `
    <div class="thread" data-date="${thread.lastMessageDate}" data-subject="${escapeHtml(thread.subject)}">
      <h2 class='thread-subject'>${escapeHtml(thread.subject)}</h2>
      ${thread.messages.map(message => `
        <div class="message">
          <div class="message-header">
            <span class="from">${escapeHtml(message.from)}</span>
            <span class="date">${new Date(message.date).toLocaleString()}</span>
          </div>
          <div class="message-body">${sanitizeEmailHtml(message.body)}</div>
        </div>
      `).join('')}
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Public Threads</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 { color: #2c3e50; }
          .thread {
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 20px;
          }
          .thread-subject {
            color: #34495e;
            margin-top: 0;
          }
          .message {
            border-top: 1px solid #eee;
            padding-top: 10px;
            margin-top: 10px;
          }
          .message-header {
            font-size: 0.9em;
            color: #7f8c8d;
            margin-bottom: 5px;
          }
          .message-body {
            margin-top: 10px;
          }
          .message-body img {
            max-width: 100%;
            height: auto;
          }
          #sortSelect {
            margin-bottom: 20px;
          }
        </style>
        <script>
          function sortThreads(sortBy) {
            const threadContainer = document.getElementById('threadContainer');
            const threads = Array.from(threadContainer.children);

            threads.sort((a, b) => {
              const aValue = a.getAttribute('data-' + sortBy);
              const bValue = b.getAttribute('data-' + sortBy);
              if (sortBy === 'date') {
                return new Date(bValue) - new Date(aValue);
              } else {
                return aValue.localeCompare(bValue);
              }
            });

            threads.forEach(thread => threadContainer.appendChild(thread));
          }
        </script>
      </head>
      <body>
        <h1>Public Threads</h1>
        <p style="color: #7f8c8d; margin-bottom: 15px;">${threadArray.length} threads, ${messageCount} messages</p>
        <select id="sortSelect" onchange="sortThreads(this.value)">
          <option value="date">Sort by Date</option>
          <option value="subject">Sort by Subject</option>
        </select>
        <div id="threadContainer">
          ${threadHtml}
        </div>
      </body>
    </html>
  `;
}

function publishPublicThreads() {
  if (!GmailApp.getUserLabelByName(LABEL_PUBLIC)) {
    GmailApp.createLabel(LABEL_PUBLIC);
  }

  const cache = CacheService.getScriptCache();
  let html = cache.get('public_threads_html');
  if (!html) {
    const threads = getThreadsInLabel(LABEL_PUBLIC);
    html = writeThreadsToHtml(threads);
    try {
      cache.put('public_threads_html', html, WEBAPP_CACHE_TTL_SEC);
    } catch (e) {
      console.log(`Skipped caching (likely >100KB): ${e.toString()}`);
    }
  }

  return HtmlService.createHtmlOutput(html)
    .setTitle("Public Threads")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGet() {
  return publishPublicThreads();
}
