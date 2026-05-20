/*
Shared helpers.
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

function createLabelWithPolicy_(name) {
  const vis = labelVisibility(name);
  return Gmail.Users.Labels.create({
    name: name,
    labelListVisibility: vis.label,
    messageListVisibility: vis.message
  }, 'me');
}

// Get-or-create a Gmail advanced-service label, mutating the cache map so subsequent calls in the same run are free.
function getOrCreateLabelCached(labelMap, name) {
  var key = name.toLowerCase();
  if (labelMap[key]) return labelMap[key];
  var created = createLabelWithPolicy_(name);
  labelMap[key] = created;
  return created;
}

function timeBudgetExceeded(startMs) {
  return Date.now() - startMs > EXECUTION_TIME_LIMIT_MS;
}

// Calls fn() and swallows any throw, logging "<label> failed: ...".
// Used to keep one failing subroutine from aborting a cleanup pass.
function safely_(label, fn) {
  try { return fn(); } catch (e) { console.log(label + ' failed: ' + e.toString()); }
}

// Drops quoted reply history ("On ... wrote:" + leading-`>` lines) from a
// plain-text email body. Used by drafter + burndown to get a clean snippet.
function stripQuotedReplyHistory_(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^On .+ wrote:\s*$/.test(line.trim())) break;
    if (/^>+/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

function getOrCreateUserLabel(name) {
  let label = GmailApp.getUserLabelByName(name);
  if (label) return label;
  createLabelWithPolicy_(name);
  return GmailApp.getUserLabelByName(name);
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

// Shared Gemini call. Returns parsed response JSON object, or null on any failure.
// opts = { temperature = 0, logPrefix = 'gemini' }
function callGemini_(prompt, apiKey, opts) {
  opts = opts || {};
  const temperature = opts.temperature !== undefined ? opts.temperature : 0;
  const logPrefix = opts.logPrefix || 'gemini';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: 'application/json' }
  };
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    if (code !== 200) {
      console.log(`${logPrefix}: API ${code}: ${response.getContentText().substring(0, 200)}`);
      return null;
    }
    const text = JSON.parse(response.getContentText()).candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (e) {
    console.log(`${logPrefix}: ${e.toString()}`);
    return null;
  }
}

// Strips every user label except the ones in keepNames. Used when a thread's labels should be
// reset to a known set (e.g., pretrash carries only 🗑️).
function stripAllLabelsExcept(threads, keepNames) {
  if (!threads || threads.length === 0) return;
  threads.forEach(t => {
    t.getLabels().forEach(l => {
      if (!keepNames.includes(l.getName())) t.removeLabel(l);
    });
  });
}

// Composite cleanup applied whenever a thread is demoted from important (by user or by LLM):
// drops domain bunch labels and the stash label, since both only belong on importants.
function cleanDemotedThreads(threads, source) {
  if (!threads || threads.length === 0) return;
  const n = stripBunchLabels(threads);
  if (n > 0) Logger.log('🏷️ Stripped ' + n + ' bunch tags from ' + source + '.');
  removeStashLabel(threads);
}

function removeLabelIfExists_(name, threads) {
  if (!threads || threads.length === 0) return;
  const l = GmailApp.getUserLabelByName(name);
  if (l) l.removeFromThreads(threads);
}

// Removes the Stash label from a batch of threads. Used when an attachment-bearing thread
// loses importance, so 🪎 doesn't outlive the importance flag.
function removeStashLabel(threads) {
  if (!threads || threads.length === 0) return;
  const stashLabel = GmailApp.getUserLabelByName(LABEL_STASH);
  if (stashLabel) stashLabel.removeFromThreads(threads);
}

function buildDraftMapForThreads_() {
  const map = new Map();
  GmailApp.getDrafts().forEach(d => {
    try { map.set(d.getMessage().getThread().getId(), d); } catch (e) { /* dangling draft */ }
  });
  return map;
}

function buildDraftThreadIdSet_() {
  return new Set(buildDraftMapForThreads_().keys());
}

// Quoted-original block so recipients see context — matches Gmail's Reply UI output.
function buildReplyBody_(thread, draftText, userEmail) {
  const lower = userEmail.toLowerCase();
  const original = thread.getMessages().slice().reverse().find(m => !m.getFrom().toLowerCase().includes(lower));
  const escapedDraft = escapeHtml(draftText).replace(/\n/g, '<br>');
  if (!original) return { body: draftText, htmlBody: `<div>${escapedDraft}</div>` };

  const attribution = `On ${formatReplyDate_(original.getDate())}, ${original.getFrom()} wrote:`;
  const quotedPlain = (original.getPlainBody() || '').split('\n').map(l => '> ' + l).join('\n');
  const body = `${draftText}\n\n${attribution}\n${quotedPlain}`;

  const htmlBody =
    `<div>${escapedDraft}</div>` +
    `<div><br></div>` +
    `<div>${escapeHtml(attribution)}</div>` +
    `<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex;">${original.getBody() || ''}</blockquote>`;

  return { body, htmlBody };
}

function formatReplyDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "EEE, MMM d, yyyy 'at' h:mm a");
}

function wasReplySentAfter_(thread, userEmail, sinceTimestamp) {
  const since = new Date(sinceTimestamp);
  const lower = userEmail.toLowerCase();
  return thread.getMessages().some(m =>
    m.getFrom().toLowerCase().includes(lower) && m.getDate() > since
  );
}

// Removes domain-style user labels (those produced by bunch) from threads
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
