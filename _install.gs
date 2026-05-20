/*
Project bootstrap: install, diagnose, menu, labels, triggers.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function install() {
  Logger.log('--- GmailClassifier install ---');
  const ss = getOrCreateClassifierSheet();
  Logger.log(`Spreadsheet: ${ss.getUrl()}`);
  if (_spreadsheetFreshlyCreated) {
    Logger.log('(skipped validate, spreadsheet just created with current schema)');
  } else {
    validate();
  }
  const apiKey = PropertiesService.getScriptProperties().getProperty(PROPS.GEMINI_API_KEY);
  Logger.log(apiKey
    ? `✓ GEMINI_API_KEY is set (length ${apiKey.length})`
    : `⚠ GEMINI_API_KEY not set. Project Settings → Script Properties → add it.`);
  try {
    Gmail.Users.getProfile('me');
    Logger.log('✓ Gmail Advanced Service is enabled');
  } catch (e) {
    Logger.log(`⚠ Gmail Advanced Service not enabled (${e.toString()}). Project Settings → Services → add Gmail API.`);
  }
  ensureLabels_();
  ensureTriggers_();
  ensureMenuTrigger_();
  Logger.log(`Classifier shadow mode: ${CLASSIFIER_SHADOW_MODE ? 'ON (logging only)' : 'OFF (LLM gates decisions)'}`);
  Logger.log('--- install complete ---');
}

function diagnose() {
  Logger.log('--- GmailClassifier diagnose ---');
  const ss = getOrCreateClassifierSheet();
  Logger.log('Spreadsheet: ' + ss.getUrl());

  const tabs = getClassifierTabs();
  const counts = {
    training: Math.max(0, tabs.training.getLastRow() - 1),
    tracking: Math.max(0, tabs.tracking.getLastRow() - 1),
    decisions: Math.max(0, tabs.decisions.getLastRow() - 1),
    wins: Math.max(0, tabs.wins.getLastRow() - 1)
  };
  Logger.log(`Rows: training=${counts.training}, tracking=${counts.tracking}, decisions=${counts.decisions}, wins=${counts.wins}`);

  if (counts.training > 0) {
    const verdicts = tabs.training.getRange(2, 6, counts.training, 1).getValues();
    let keep = 0, trash = 0;
    verdicts.forEach(([v]) => { if (v === VERDICT_KEEP) keep++; else if (v === VERDICT_TRASH) trash++; });
    Logger.log(`Training split: ${keep} keep / ${trash} trash`);
    const min = CLASSIFIER_MIN_EXAMPLES_PER_CLASS;
    if (keep < min || trash < min) Logger.log(`⚠ Cold start: classifier abstains until ${min} keep + ${min} trash`);
    else Logger.log('✓ Classifier has enough training examples');
  } else {
    Logger.log('⚠ Training tab empty: classifier will abstain on all runs');
  }

  if (counts.tracking > 0) {
    const types = tabs.tracking.getRange(2, 2, counts.tracking, 1).getValues();
    const byType = {};
    types.forEach(([t]) => { byType[t] = (byType[t] || 0) + 1; });
    Logger.log('Tracking by type: ' + JSON.stringify(byType));
  }

  if (counts.decisions > 0) {
    const lastTs = tabs.decisions.getRange(counts.decisions + 1, 1).getValue();
    Logger.log('Latest Decisions row: ' + lastTs);
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty(PROPS.GEMINI_API_KEY);
  Logger.log(apiKey ? '✓ GEMINI_API_KEY set' : '⚠ GEMINI_API_KEY missing');

  try { Gmail.Users.getProfile('me'); Logger.log('✓ Gmail Advanced Service enabled'); }
  catch (e) { Logger.log('⚠ Gmail Advanced Service not enabled: ' + e.toString()); }

  const triggers = ScriptApp.getProjectTriggers();
  Logger.log('Triggers (' + triggers.length + '):');
  triggers.forEach(t => Logger.log('  - ' + t.getHandlerFunction() + ' (' + t.getTriggerSource() + ')'));

  Logger.log('Shadow mode: ' + (CLASSIFIER_SHADOW_MODE ? 'ON (logs only)' : 'OFF (LLM acts)'));
  Logger.log('--- diagnose complete ---');
}

function addClassifierMenu() {
  SpreadsheetApp.getUi()
    .createMenu('GmailClassifier')
    .addItem('Diagnose', 'diagnose')
    .addItem('Run cleanUp now', TRIGGER_CLEANUP_HANDLER)
    .addItem('Run cleanUpDeep now', TRIGGER_CLEANUP_DEEP_HANDLER)
    .addSeparator()
    .addItem('Bootstrap training', 'bootstrapTraining')
    .addItem('Clean legacy pretrash labels', 'cleanPretrashLegacyLabels')
    .addSeparator()
    .addItem('Re-run install', 'install')
    .addToUi();
}

function ensureMenuTrigger_() {
  const ssId = getOrCreateClassifierSheet().getId();
  const exists = ScriptApp.getProjectTriggers().some(t =>
    t.getHandlerFunction() === MENU_HANDLER && t.getTriggerSourceId() === ssId
  );
  if (exists) {
    Logger.log('✓ menu trigger already exists');
    return;
  }
  ScriptApp.newTrigger(MENU_HANDLER).forSpreadsheet(ssId).onOpen().create();
  Logger.log('+ menu trigger installed');
}

function ensureLabels_() {
  PROTECTED_LABELS.forEach(name => getOrCreateUserLabel(name));
  Logger.log('✓ labels available: ' + PROTECTED_LABELS.join(' '));
}

// Always delete + recreate. Apps Script doesn't expose existing-trigger
// intervals, so this is the only way interval changes (TRIGGER_*_MIN) and
// handler renames propagate. Menu trigger is preserved.
function ensureTriggers_() {
  const wanted = [
    { fn: TRIGGER_CLEANUP_HANDLER,              kind: 'minutes',     value: TRIGGER_CLEANUP_MIN },
    { fn: TRIGGER_CLEANUP_DEEP_HANDLER,         kind: 'minutes',     value: TRIGGER_CLEANUP_DEEP_MIN },
    { fn: TRIGGER_BUNCH_HANDLER,                kind: 'minutes',     value: TRIGGER_BUNCH_MIN },
    { fn: TRIGGER_REMOVE_EMPTY_LABELS_HANDLER,  kind: 'minutes',     value: TRIGGER_REMOVE_EMPTY_LABELS_MIN },
    { fn: TRIGGER_BURNDOWN_HANDLER,             kind: 'dailyAtHour', value: BURNDOWN_HOUR }
  ];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === MENU_HANDLER) return;
    ScriptApp.deleteTrigger(t);
  });
  wanted.forEach(w => {
    if (w.kind === 'minutes') {
      ScriptApp.newTrigger(w.fn).timeBased().everyMinutes(w.value).create();
      Logger.log(`+ trigger ${w.fn} (every ${w.value} min)`);
    } else if (w.kind === 'dailyAtHour') {
      ScriptApp.newTrigger(w.fn).timeBased().atHour(w.value).everyDays(1).create();
      Logger.log(`+ trigger ${w.fn} (daily at hour ${w.value})`);
    }
  });
}
