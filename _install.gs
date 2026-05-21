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
  const obsRows = Math.max(0, tabs.observations.getLastRow() - 1);
  const trackingRows = Math.max(0, tabs.tracking.getLastRow() - 1);
  Logger.log(`Rows: observations=${obsRows}, tracking=${trackingRows}`);

  if (obsRows > 0) {
    const data = tabs.observations.getDataRange().getValues();
    const col = observationsColMap_();
    const states = {};
    const sources = {};
    let keep = 0, trash = 0;
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      states[r[col.state]] = (states[r[col.state]] || 0) + 1;
      if (r[col.truthSource]) sources[r[col.truthSource]] = (sources[r[col.truthSource]] || 0) + 1;
      if (r[col.state] !== OBS_STATE_PENDING && r[col.state] !== OBS_STATE_EXPIRED) {
        if (r[col.truthVerdict] === VERDICT_KEEP) keep++;
        else if (r[col.truthVerdict] === VERDICT_TRASH) trash++;
      }
    }
    Logger.log('States: ' + JSON.stringify(states));
    Logger.log('Truth sources: ' + JSON.stringify(sources));
    Logger.log(`Settled split: ${keep} keep / ${trash} trash`);
    const min = CLASSIFIER_MIN_EXAMPLES_PER_CLASS;
    if (keep < min || trash < min) Logger.log(`⚠ Cold start: classifier abstains until ${min} keep + ${min} trash. Run seedObservations() once.`);
    else Logger.log('✓ Classifier has enough training examples');
  } else {
    Logger.log('⚠ Observations tab empty: classifier will abstain. Run seedObservations() once to bootstrap.');
  }

  if (trackingRows > 0) {
    const types = tabs.tracking.getRange(2, 2, trackingRows, 1).getValues();
    const byType = {};
    types.forEach(([t]) => { byType[t] = (byType[t] || 0) + 1; });
    Logger.log('Tracking by type: ' + JSON.stringify(byType));
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
    .addItem('Seed observations', 'seedObservations')
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
