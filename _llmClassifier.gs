/*
Gemini Flash classifier and shadow-mode logger.
Requires Script Property GEMINI_API_KEY.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

let _examplesCache;

function classifyThreadsLLM(threads, mode) {
  return classifyFeatures(buildThreadFeatures(threads), mode);
}

function classifyFeatures(features, mode) {
  if (!features || features.length === 0) return [];

  const apiKey = PropertiesService.getScriptProperties().getProperty(PROPS.GEMINI_API_KEY);
  if (!apiKey) {
    console.log('classifier: GEMINI_API_KEY not set, abstaining.');
    return null;
  }

  const examples = loadFewShotExamples_();
  if (examples.keep.length < CLASSIFIER_MIN_EXAMPLES_PER_CLASS || examples.trash.length < CLASSIFIER_MIN_EXAMPLES_PER_CLASS) {
    console.log(`classifier: cold start (${examples.keep.length} keep / ${examples.trash.length} trash), abstaining.`);
    return null;
  }

  const results = [];
  for (let i = 0; i < features.length; i += CLASSIFIER_BATCH_SIZE) {
    const batch = features.slice(i, i + CLASSIFIER_BATCH_SIZE);
    const batchResults = classifyBatch_(batch, examples, apiKey, mode);
    if (batchResults) results.push.apply(results, batchResults);
  }
  return results;
}

// Wraps a default Gmail action so that shadow logging and Phase 3 LLM gating live in one place.
// Today: log every classification (actor=gmail), then run applyFn on all threads.
// Phase 3 (CLASSIFIER_SHADOW_MODE = false): filter threads by LLM verdict + CLASSIFIER_CONFIDENCE_THRESHOLD
// before applyFn, and log gated threads with actor=ACTOR_LLM. This function is the single site to edit.
function withClassifier(threads, mode, fnName, gmailVerdict, applyFn) {
  logDecisions(threads, mode, fnName, gmailVerdict);
  applyFn(threads);
}

function logDecisions(threads, mode, fnName, gmailVerdict) {
  if (!CLASSIFIER_SHADOW_MODE) return;
  try {
    const features = buildThreadFeatures(threads);
    const results = classifyFeatures(features, mode);
    if (!results) return;
    const byId = {};
    results.forEach(r => byId[r.id] = r);
    const rows = [];
    const now = new Date().toISOString();
    features.forEach(f => {
      const res = byId[f.id];
      if (res) rows.push([now, f.id, f.sender, f.subject, fnName, gmailVerdict, res.verdict, res.confidence, ACTOR_GMAIL]);
    });
    appendRowsBatch(getClassifierTabs().decisions, rows);
  } catch (e) {
    console.log(`logDecisions (${fnName}): ${e.toString()}`);
  }
}

function classifyBatch_(features, examples, apiKey, mode) {
  const prompt = buildPrompt_(features, examples, mode);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
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
      console.log(`classifier: API ${code}: ${response.getContentText().substring(0, 200)}`);
      return null;
    }
    const body = JSON.parse(response.getContentText());
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed.results || [];
  } catch (e) {
    console.log(`classifier: error ${e.toString()}`);
    return null;
  }
}

function buildPrompt_(features, examples, mode) {
  const intent = mode === CLASSIFIER_MODE_PINNED
    ? 'These emails are currently treated as important (pinned/snoozed). Decide if each should genuinely be kept ("keep") or actually trashed ("trash").'
    : 'These emails are candidates for auto-deletion. Decide if each should genuinely be trashed ("trash") or actually kept ("keep").';

  const keepLines = examples.keep.slice(0, CLASSIFIER_FEWSHOT_PER_CLASS)
    .map(e => `KEEP | From: ${e.sender} | Subject: ${e.subject} | ${e.snippet}`).join('\n');
  const trashLines = examples.trash.slice(0, CLASSIFIER_FEWSHOT_PER_CLASS)
    .map(e => `TRASH | From: ${e.sender} | Subject: ${e.subject} | ${e.snippet}`).join('\n');

  const itemsText = features
    .map(f => `id: ${f.id} | From: ${f.sender} | Subject: ${f.subject} | ${f.snippet}`).join('\n');

  return `You classify personal emails as "keep" or "trash" for inbox cleanup.
- "keep" = mail the user wants to see/preserve
- "trash" = low-value, can be auto-deleted

${intent}

Examples from this user's history:
${keepLines}
${trashLines}

Classify the following emails. Respond with JSON only:
{"results": [{"id": "...", "verdict": "keep" | "trash", "confidence": 0.0-1.0}, ...]}

Emails:
${itemsText}`;
}

function loadFewShotExamples_() {
  if (_examplesCache) return _examplesCache;
  const data = getClassifierTabs().training.getDataRange().getValues();
  const keep = [];
  const trash = [];
  for (let i = data.length - 1; i >= 1; i--) {
    const [, , sender, subject, snippet, verdict] = data[i];
    const entry = { sender, subject, snippet };
    if (verdict === VERDICT_KEEP && keep.length < CLASSIFIER_FEWSHOT_PER_CLASS) keep.push(entry);
    else if (verdict === VERDICT_TRASH && trash.length < CLASSIFIER_FEWSHOT_PER_CLASS) trash.push(entry);
    if (keep.length >= CLASSIFIER_FEWSHOT_PER_CLASS && trash.length >= CLASSIFIER_FEWSHOT_PER_CLASS) break;
  }
  _examplesCache = { keep, trash };
  return _examplesCache;
}
