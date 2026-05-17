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
