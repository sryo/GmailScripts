/**
 * Script that groups emails by domain, similar to Hey bundles.
 * Author: Mateo Yadarola (teodalton@gmail.com)
 */

const USER_PROPERTY_LAST_LABEL_TIME = 'lastLabelAddedTime';
const MAX_RESULTS = 25;
const LABEL_VISIBILITY = 'labelHide';

function tagEmailsByDomain() {
  let pageToken;
  const userProperties = PropertiesService.getUserProperties();

  do {
    try {
      const threads = fetchThreads(pageToken);
      if (!threads || !threads.threads || threads.threads.length === 0) {
        console.log("No more threads to process or threads object is undefined.");
        break;
      }
      
      const labelsAddedInCurrentIteration = processThreads(threads.threads, userProperties);
      
      if (!labelsAddedInCurrentIteration) {
        console.log(`No new labels were added in this run.`);
      }
      
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
    maxResults: MAX_RESULTS,
    pageToken: pageToken
  });
}

function processThreads(threads, userProperties) {
  let labelsAddedInCurrentIteration = false;

  for (const thread of threads) {
    try {
      const threadDetails = Gmail.Users.Threads.get('me', thread.id);
      if (!threadDetails || !threadDetails.messages) continue;

      const messages = threadDetails.messages;

      for (const message of messages) {
        if (!message.payload || !message.payload.headers) continue;

        const sender = getSenderFromHeaders(message.payload.headers);

        if (sender) {
          const domain = extractDomain(sender);

          if (domain) {
            const label = getOrCreateLabel(domain);
            Gmail.Users.Threads.modify({ addLabelIds: [label.id] }, 'me', thread.id);

            const senderName = extractSenderName(sender);
            updateLastLabelAddedTime(userProperties);
            labelsAddedInCurrentIteration = true;

            Logger.log(`Added label '${domain}' to thread ${thread.id} from '${senderName}'`);
            break; // label once per thread
          } else {
            console.log(`Could not extract domain from sender '${sender}' in thread: ${thread.id}`);
          }
        } else {
          console.log(`Skipped message in thread ${thread.id}: No 'From' header found.`);
        }
      }
    } catch (e) {
      console.error(`Failed to process thread ${thread.id}. Error: ${e.toString()}`);
    }
  }

  return labelsAddedInCurrentIteration;
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

function getOrCreateLabel(domain) {
  const existingLabels = Gmail.Users.Labels.list('me').labels;
  const existingLabel = existingLabels.find(label => label.name.toLowerCase() === domain.toLowerCase());
  
  if (existingLabel) {
    return existingLabel;
  }
  
  const newLabel = {
    name: domain,
    labelListVisibility: LABEL_VISIBILITY,
    messageListVisibility: 'show'
  };
  
  return Gmail.Users.Labels.create(newLabel, 'me');
}

function getLastLabelAddedTime(userProperties) {
  let lastLabelAddedTime = userProperties.getProperty(USER_PROPERTY_LAST_LABEL_TIME);
  if (!lastLabelAddedTime) {
    lastLabelAddedTime = new Date().toISOString();
    userProperties.setProperty(USER_PROPERTY_LAST_LABEL_TIME, lastLabelAddedTime);
  }
  return new Date(lastLabelAddedTime);
}

function updateLastLabelAddedTime(userProperties) {
  const now = new Date();
  userProperties.setProperty(USER_PROPERTY_LAST_LABEL_TIME, now.toISOString());
}
