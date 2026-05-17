/**
 * Script that groups emails by domain, similar to Hey bundles.
 * Author: Mateo Yadarola (teodalton@gmail.com)
 */

function tagEmailsByDomain() {
  const startMs = Date.now();
  const labelMap = buildLabelMap();
  let pageToken;

  do {
    try {
      if (timeBudgetExceeded(startMs)) {
        console.log('Time budget exceeded; will resume on next trigger.');
        break;
      }
      const threads = fetchThreads(pageToken);
      if (!threads || !threads.threads || threads.threads.length === 0) {
        console.log("No more threads to process.");
        break;
      }
      const added = processThreads(threads.threads, labelMap);
      if (!added) console.log(`No new labels were added in this run.`);
      pageToken = threads.nextPageToken;
    } catch (e) {
      console.error(`An error occurred during execution: ${e.toString()}`);
      break;
    }
  } while (pageToken);

  console.log("Script execution finished.");
}

function fetchThreads(pageToken) {
  return Gmail.Users.Threads.list('me', {
    q: 'has:nouserlabels',
    maxResults: MAX_THREADS_TAG,
    pageToken: pageToken
  });
}

function processThreads(threads, labelMap) {
  let added = false;
  for (const thread of threads) {
    try {
      const threadDetails = Gmail.Users.Threads.get('me', thread.id, {
        format: 'metadata',
        metadataHeaders: ['From']
      });
      if (!threadDetails || !threadDetails.messages) continue;

      for (const message of threadDetails.messages) {
        if (!message.payload || !message.payload.headers) continue;
        const sender = getSenderFromHeaders(message.payload.headers);
        if (!sender) {
          console.log(`Skipped message in thread ${thread.id}: No 'From' header found.`);
          continue;
        }
        const domain = extractDomain(sender);
        if (!domain) {
          console.log(`Could not extract domain from '${sender}' in thread: ${thread.id}`);
          continue;
        }
        const label = getOrCreateLabelCached(labelMap, domain);
        Gmail.Users.Threads.modify({ addLabelIds: [label.id] }, 'me', thread.id);
        Logger.log(`Added label '${domain}' to thread ${thread.id} from '${extractSenderName(sender)}'`);
        added = true;
        break;
      }
    } catch (e) {
      console.error(`Failed to process thread ${thread.id}. Error: ${e.toString()}`);
    }
  }
  return added;
}

function getSenderFromHeaders(headers) {
  const fromHeader = headers.find(header => header.name === 'From');
  return fromHeader ? fromHeader.value : null;
}

function extractDomain(sender) {
  const match = sender.match(/@([a-zA-Z0-9.-]+)/);
  return match ? match[1] : null;
}

function extractSenderName(sender) {
  const match = sender.match(/^([^<]*)</);
  return match ? match[1].trim() : sender;
}
