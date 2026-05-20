/*
Deep pass: Gemini classifier, Riff drafter, training harvest.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function cleanUpDeep() {
  initCleanRun_();

  safely_('harvestCorrections', harvestCorrections);
  safely_('computeWins', computeWins);
  safely_('riff', riff);
  safely_('processBurndownReplies_', processBurndownReplies_);
  safely_('promoteFalseUnimportant', promoteFalseUnimportant);
  safely_('demoteFalseImportant', demoteFalseImportant);
  logCleanDate();
}

function demoteFalseImportant() {
  const threads = GmailApp.search('is:important in:inbox -label:pinned -label:snoozed -is:starred -label:"' + LABEL_PUBLIC + '" -label:"' + LABEL_AUTOREPLY + '" -label:' + LABEL_PRETRASH);
  applyClassifierImportance_(threads, {
    fnName: 'demoteFalseImportant',
    gmailVerdict: VERDICT_KEEP,
    triggerVerdict: VERDICT_TRASH,
    emoji: '📉',
    applyFn: ts => GmailApp.markThreadsUnimportant(ts),
    llmActionType: TRACKING_TYPE_LLM_DEMOTED
  });
}

function promoteFalseUnimportant() {
  const threads = GmailApp.search('is:unimportant in:inbox -label:pinned -label:snoozed -label:done -label:"' + LABEL_AUTOREPLY + '" -label:' + LABEL_PRETRASH + ' newer_than:' + PROMOTE_LOOKBACK_DAYS + 'd');
  applyClassifierImportance_(threads, {
    fnName: 'promoteFalseUnimportant',
    gmailVerdict: VERDICT_TRASH,
    triggerVerdict: VERDICT_KEEP,
    emoji: '⭐',
    applyFn: ts => GmailApp.markThreadsImportant(ts),
    llmActionType: TRACKING_TYPE_LLM_PROMOTED
  });
}

function applyClassifierImportance_(threads, opts) {
  if (threads.length === 0) return;

  const tabs = getClassifierTabs();
  const classified = buildTrackingIndex(getTrackingValues_())[TRACKING_TYPE_CLASSIFIED_IMPORTANCE];

  // Cuts repeat Gemini spend on already-classified threads.
  const eligible = threads.filter(t => !classified[t.getId()]);
  if (eligible.length === 0) return;

  const features = buildThreadFeatures(eligible);
  const results = classifyFeatures(features);
  if (!results) return;

  const byId = {};
  results.forEach(r => byId[r.id] = r);

  const toAct = [];
  const classifiedIds = [];
  const decisionRows = [];
  const now = new Date().toISOString();

  features.forEach((f, i) => {
    const res = byId[f.id];
    if (!res) return;
    const llmVerdict = String(res.verdict || '').toLowerCase();
    const conf = Number(res.confidence) || 0;
    const shouldAct = !CLASSIFIER_SHADOW_MODE && llmVerdict === opts.triggerVerdict && conf >= CLASSIFIER_CONFIDENCE_THRESHOLD;
    const actor = shouldAct ? ACTOR_LLM : ACTOR_GMAIL;
    decisionRows.push([now, f.id, f.sender, f.subject, opts.fnName, opts.gmailVerdict, llmVerdict, conf, actor]);
    classifiedIds.push(f.id);
    if (shouldAct) toAct.push(eligible[i]);
  });

  safely_(opts.fnName + ' log', () => appendRowsBatch(tabs.decisions, decisionRows));
  safely_(opts.fnName + ' track', () => recordTrackingRows(classifiedIds, TRACKING_TYPE_CLASSIFIED_IMPORTANCE));

  if (toAct.length > 0) {
    markCleaned_();
    Logger.log(opts.emoji + ' ' + opts.fnName + ': ' + toAct.length + ' of ' + eligible.length + '.');
    opts.applyFn(toAct);
    if (opts.llmActionType) recordTrackingRows(toAct.map(t => t.getId()), opts.llmActionType);
    if (opts.llmActionType === TRACKING_TYPE_LLM_DEMOTED) cleanDemotedThreads(toAct, 'LLM-demoted');
  }
}
