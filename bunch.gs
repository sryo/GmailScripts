/*
Bunches important threads by sender domain. Sweeps empty user labels.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

const SENDER_HEADER_FALLBACKS = ['From', 'Sender', 'Reply-To', 'Return-Path'];
const FALLBACK_SENDER_DOMAIN = 'unknown.sender';

function bunch() {
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
    q: 'is:important has:nouserlabels -label:low_priority -label:promos -category:updates -in:trash',
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
        metadataHeaders: SENDER_HEADER_FALLBACKS
      });
      if (!threadDetails || !threadDetails.messages) continue;

      let labeled = false;
      for (const message of threadDetails.messages) {
        if (!message.payload || !message.payload.headers) continue;
        const sender = getSenderFromHeaders(message.payload.headers);
        if (!sender) continue;
        const domain = extractDomain(sender);
        if (!domain) {
          console.log(`Could not extract domain from '${sender}' in thread: ${thread.id}`);
          continue;
        }
        const label = getOrCreateLabelCached(labelMap, domain);
        Gmail.Users.Threads.modify({ addLabelIds: [label.id] }, 'me', thread.id);
        Logger.log(`Added label '${domain}' to thread ${thread.id} from '${extractSenderName(sender)}'`);
        labeled = true;
        added = true;
        break;
      }

      // Fallback so senderless threads stop re-matching has:nouserlabels every trigger.
      if (!labeled) {
        const label = getOrCreateLabelCached(labelMap, FALLBACK_SENDER_DOMAIN);
        Gmail.Users.Threads.modify({ addLabelIds: [label.id] }, 'me', thread.id);
        Logger.log(`Fallback-labeled thread ${thread.id} as '${FALLBACK_SENDER_DOMAIN}' (no usable sender header).`);
        added = true;
      }
    } catch (e) {
      console.error(`Failed to process thread ${thread.id}. Error: ${e.toString()}`);
    }
  }
  return added;
}

function getSenderFromHeaders(headers) {
  for (const name of SENDER_HEADER_FALLBACKS) {
    const h = headers.find(header => header.name === name);
    if (h && h.value) return h.value;
  }
  return null;
}

function extractDomain(sender) {
  const match = sender.match(/@([a-zA-Z0-9.-]+)/);
  return match ? match[1] : null;
}

function extractSenderName(sender) {
  const match = sender.match(/^([^<]*)</);
  return match ? match[1].trim() : sender;
}

// Sweeps user labels in pages of 50; resumes via PROPS.OFFSET across runs.
function removeEmptyLabels() {
  const labels = GmailApp.getUserLabels();
  const limit = 50;
  let offset = parseInt(userProperties.getProperty(PROPS.OFFSET), 10);
  if (isNaN(offset) || offset >= labels.length) offset = 0;

  if (labels.length === 0) {
    Logger.log("No labels to process.");
  } else {
    const end = Math.min(offset + limit, labels.length);
    const filled = Math.min(10, Math.floor(end / labels.length * 10));
    Logger.log('🟩'.repeat(filled) + '⬜'.repeat(10 - filled) + ' ' + offset + '-' + end + ' / ' + labels.length);
  }

  let i;
  for (i = offset; i < offset + limit && i < labels.length; i++) {
    const name = labels[i].getName();
    if (PROTECTED_LABELS.includes(name)) continue;
    if (labels[i].getThreads().length === 0) {
      labels[i].deleteLabel();
      Logger.log('🏷️ Deleted empty label: ' + name);
      markCleaned_();
    }
  }
  userProperties.setProperty(PROPS.OFFSET, i);
}
