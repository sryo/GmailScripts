/*
Asks Gemini whether to keep or trash, using settled observations as few-shot examples.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

let _examplesCache;

function classifyFeatures(features) {
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
    const batchResults = classifyBatch_(batch, examples, apiKey);
    if (batchResults) results.push.apply(results, batchResults);
  }
  return results;
}

function classifyBatch_(features, examples, apiKey) {
  const result = callGemini_(buildPrompt_(features, examples), apiKey, { logPrefix: 'classifier' });
  return result ? (result.results || []) : null;
}

function buildPrompt_(features, examples) {
  const intent = 'These emails currently sit in Gmail with Gmail\'s importance flag set. Decide if each should genuinely be kept ("keep") or actually trashed ("trash") based on the user\'s observed behavior in the examples below.';

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

// Two-pass loader: corrected user actions first (highest signal), then confirmations (silence past
// the flip window), then seed rows. Each pass walks newest-first and stops once both classes hit
// quota. Keeps real user signal in the few-shot window even when confirmations dominate by volume.
function loadFewShotExamples_() {
  if (_examplesCache) return _examplesCache;
  const sheet = getClassifierTabs().observations;
  const data = sheet.getDataRange().getValues();
  const col = observationsColMap_();
  const quota = CLASSIFIER_FEWSHOT_PER_CLASS;
  const keep = [];
  const trash = [];

  const corrected = new Set([
    TRUTH_SOURCE_USER_FLIP,
    TRUTH_SOURCE_USER_SALVAGE,
    TRUTH_SOURCE_USER_STAR_PIN,
    TRUTH_SOURCE_USER_BURNDOWN_REPLY
  ]);
  const tier = src => corrected.has(src) ? 0 : src === TRUTH_SOURCE_GMAIL_HELD ? 1 : 2;

  for (let pass = 0; pass <= 2; pass++) {
    if (keep.length >= quota && trash.length >= quota) break;
    for (let i = data.length - 1; i >= 1; i--) {
      const r = data[i];
      if (r[col.state] === OBS_STATE_PENDING || r[col.state] === OBS_STATE_EXPIRED) continue;
      if (tier(r[col.truthSource]) !== pass) continue;
      const entry = { sender: r[col.sender], subject: r[col.subject], snippet: r[col.snippet] };
      const verdict = r[col.truthVerdict];
      if (verdict === VERDICT_KEEP && keep.length < quota) keep.push(entry);
      else if (verdict === VERDICT_TRASH && trash.length < quota) trash.push(entry);
      if (keep.length >= quota && trash.length >= quota) break;
    }
  }

  _examplesCache = { keep, trash };
  return _examplesCache;
}
