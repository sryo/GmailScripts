/*
HTML escape/sanitize and shared Gmail helpers.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Conservative deny-list sanitizer for HTML email bodies before embedding in a web-app page.
// Personal-use scope: blocks script execution and dangerous URL schemes without preserving rich formatting perfectly.
function sanitizeEmailHtml(html) {
  if (!html) return '';
  var s = html;
  s = s.replace(/<(script|iframe|object|embed|style|link|meta|base)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<(script|iframe|object|embed|style|link|meta|base)\b[^>]*\/?>/gi, '');
  s = s.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');
  s = s.replace(/(href|src|action|formaction)\s*=\s*"\s*(javascript|data:text\/html)[^"]*"/gi, '$1="#"');
  s = s.replace(/(href|src|action|formaction)\s*=\s*'\s*(javascript|data:text\/html)[^']*'/gi, "$1='#'");
  return s;
}

// Returns a {nameLowercase: labelResource} map from a single Gmail advanced-service Labels.list call.
function buildLabelMap() {
  var map = {};
  var response = Gmail.Users.Labels.list('me');
  if (response.labels) {
    for (var i = 0; i < response.labels.length; i++) {
      var label = response.labels[i];
      map[label.name.toLowerCase()] = label;
    }
  }
  return map;
}

// Get-or-create a Gmail advanced-service label, mutating the cache map so subsequent calls in the same run are free.
function getOrCreateLabelCached(labelMap, name) {
  var key = name.toLowerCase();
  if (labelMap[key]) return labelMap[key];
  var created = Gmail.Users.Labels.create({
    name: name,
    labelListVisibility: 'labelHide',
    messageListVisibility: 'show'
  }, 'me');
  labelMap[key] = created;
  return created;
}

function timeBudgetExceeded(startMs) {
  return Date.now() - startMs > EXECUTION_TIME_LIMIT_MS;
}

function getOrCreateUserLabel(name) {
  let label = GmailApp.getUserLabelByName(name);
  if (label == null) label = GmailApp.createLabel(name);
  return label;
}

function extractThreadFeatures(thread, firstMessage) {
  return {
    id: thread.getId(),
    sender: firstMessage.getFrom(),
    subject: thread.getFirstMessageSubject() || '',
    snippet: (firstMessage.getPlainBody() || '').substring(0, 200)
  };
}

function buildThreadFeatures(threads) {
  if (!threads || threads.length === 0) return [];
  const messagesByThread = GmailApp.getMessagesForThreads(threads);
  return threads.map((t, i) => extractThreadFeatures(t, messagesByThread[i][0]));
}

function appendRowsBatch(sheet, rows) {
  if (!rows || rows.length === 0) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function deleteRowsReverse(sheet, rowNumbers) {
  const sorted = rowNumbers.slice().sort((a, b) => a - b);
  for (let i = sorted.length - 1; i >= 0; i--) sheet.deleteRow(sorted[i]);
}

// Composite cleanup applied whenever a thread is demoted from important (by user or by LLM):
// drops domain bunch labels and the stash label, since both only belong on importants.
function cleanDemotedThreads(threads, source) {
  if (!threads || threads.length === 0) return;
  const n = stripBunchLabels(threads);
  if (n > 0) Logger.log('🏷️ Stripped ' + n + ' bunch tags from ' + source + '.');
  removeStashLabel(threads);
}

// Removes the Stash label from a batch of threads. Used when an attachment-bearing thread
// loses importance, so 🪎 doesn't outlive the importance flag.
function removeStashLabel(threads) {
  if (!threads || threads.length === 0) return;
  const stashLabel = GmailApp.getUserLabelByName(LABEL_STASH);
  if (stashLabel) stashLabel.removeFromThreads(threads);
}

// Removes domain-style user labels (those produced by tagEmailsByDomain) from threads
// that no longer belong in a bunch: typically threads just demoted from important.
function stripBunchLabels(threads) {
  if (!threads || threads.length === 0) return 0;
  const domainPattern = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
  let stripped = 0;
  threads.forEach(t => {
    t.getLabels().forEach(l => {
      const name = l.getName();
      if (PROTECTED_LABELS.includes(name)) return;
      if (!domainPattern.test(name)) return;
      t.removeLabel(l);
      stripped++;
    });
  });
  return stripped;
}
