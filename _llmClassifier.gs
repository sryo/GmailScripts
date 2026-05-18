/*
Gemini Flash classifier and shadow-mode logger.
Requires Script Property GEMINI_API_KEY.
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
  const intent = 'These emails are currently flagged as important by Gmail. Decide if each should genuinely be kept ("keep") or actually trashed ("trash").';

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
