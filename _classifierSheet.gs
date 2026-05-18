/*
Classifier spreadsheet bootstrap and accessors.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

let _classifierSheetCache;
let _classifierTabsCache;
let _spreadsheetFreshlyCreated = false;

function getOrCreateClassifierSheet() {
  if (_classifierSheetCache) return _classifierSheetCache;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROPS.CLASSIFIER_SHEET_ID);
  const name = classifierSheetName_();
  let ss;

  // 1. Stored ID path. Best-effort Drive trashed-check; falls back to plain open if Drive isn't authorized.
  if (id) {
    let trashed = false;
    try { trashed = DriveApp.getFileById(id).isTrashed(); }
    catch (e) { console.log('Drive trashed-check skipped: ' + e.toString()); }
    if (!trashed) {
      try { ss = SpreadsheetApp.openById(id); }
      catch (e) { console.log('Stored sheet not openable: ' + e.toString()); }
    } else {
      console.log('Stored sheet is in trash; falling through.');
    }
  }

  // 2. Drive search fallback. Recovers if Script Properties was wiped but a sheet of the right name exists.
  if (!ss) {
    try {
      const files = DriveApp.getFilesByName(name);
      while (files.hasNext()) {
        const f = files.next();
        if (f.isTrashed()) continue;
        ss = SpreadsheetApp.openById(f.getId());
        props.setProperty(PROPS.CLASSIFIER_SHEET_ID, f.getId());
        Logger.log('Recovered existing sheet via Drive search: ' + ss.getUrl());
        break;
      }
    } catch (e) { console.log('Drive search skipped: ' + e.toString()); }
  }

  // 3. Create fresh, last resort.
  if (!ss) {
    ss = SpreadsheetApp.create(name);
    props.setProperty(PROPS.CLASSIFIER_SHEET_ID, ss.getId());
    _spreadsheetFreshlyCreated = true;
    Logger.log('Created classifier sheet: ' + ss.getUrl());
  }
  if (ss.getName() !== name) ss.rename(name);
  ensureSheet_(ss, SHEET_TAB_TRAINING, TRAINING_HEADERS);
  ensureSheet_(ss, SHEET_TAB_TRACKING, TRACKING_HEADERS);
  ensureSheet_(ss, SHEET_TAB_DECISIONS, DECISIONS_HEADERS);
  ensureSheet_(ss, SHEET_TAB_WINS, WINS_HEADERS);
  if (_spreadsheetFreshlyCreated) {
    const ourTabs = [SHEET_TAB_TRAINING, SHEET_TAB_TRACKING, SHEET_TAB_DECISIONS, SHEET_TAB_WINS];
    ss.getSheets().forEach(s => { if (!ourTabs.includes(s.getName())) ss.deleteSheet(s); });
  }
  _classifierSheetCache = ss;
  return ss;
}

function classifierSheetName_() {
  // Session.getEffectiveUser().getEmail() returns empty under Google's privacy defaults.
  // Gmail.Users.getProfile is already authorized via the Gmail Advanced Service.
  try {
    const email = Gmail.Users.getProfile('me').emailAddress;
    return email ? CLASSIFIER_SHEET_NAME + ' (' + email + ')' : CLASSIFIER_SHEET_NAME;
  } catch (e) {
    return CLASSIFIER_SHEET_NAME;
  }
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getClassifierTabs() {
  if (_classifierTabsCache) return _classifierTabsCache;
  const ss = getOrCreateClassifierSheet();
  _classifierTabsCache = {
    training: ss.getSheetByName(SHEET_TAB_TRAINING),
    tracking: ss.getSheetByName(SHEET_TAB_TRACKING),
    decisions: ss.getSheetByName(SHEET_TAB_DECISIONS),
    wins: ss.getSheetByName(SHEET_TAB_WINS)
  };
  return _classifierTabsCache;
}

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
    .addItem('Run cleanUp now', 'cleanUp')
    .addSeparator()
    .addItem('Bootstrap training', 'bootstrapTraining')
    .addItem('Clean legacy pretrash labels', 'cleanPretrashLegacyLabels')
    .addSeparator()
    .addItem('Migrate labels (one-shot)', 'migrateLabels')
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

function ensureTriggers_() {
  const wanted = [
    { fn: 'cleanUp',            minutes: TRIGGER_CLEANUP_MIN },
    { fn: 'bunch',              minutes: TRIGGER_BUNCH_MIN },
    { fn: 'removeEmptyLabels',  minutes: TRIGGER_REMOVE_EMPTY_LABELS_MIN }
  ];
  const wantedNames = new Set(wanted.map(w => w.fn));
  // Single pass: drop orphan triggers left over from renames, collect survivors.
  const existing = new Set();
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === MENU_HANDLER) { existing.add(fn); return; }
    if (wantedNames.has(fn)) {
      existing.add(fn);
    } else {
      ScriptApp.deleteTrigger(t);
      Logger.log(`- removed orphan trigger for ${fn}`);
    }
  });
  wanted.forEach(w => {
    if (existing.has(w.fn)) {
      Logger.log(`✓ trigger for ${w.fn} already exists`);
    } else {
      ScriptApp.newTrigger(w.fn).timeBased().everyMinutes(w.minutes).create();
      Logger.log(`+ created trigger for ${w.fn} (every ${w.minutes} min)`);
    }
  });
}

function validate() {
  const ss = getOrCreateClassifierSheet();
  [
    { tab: SHEET_TAB_TRAINING,  headers: TRAINING_HEADERS },
    { tab: SHEET_TAB_TRACKING,  headers: TRACKING_HEADERS },
    { tab: SHEET_TAB_DECISIONS, headers: DECISIONS_HEADERS },
    { tab: SHEET_TAB_WINS,      headers: WINS_HEADERS }
  ].forEach(s => migrateTab_(ss, s.tab, s.headers));
}

function migrateTab_(ss, tabName, expectedHeaders) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  const currentHeaders = lastCol === 0 ? [] : sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const matches = currentHeaders.length === expectedHeaders.length
    && currentHeaders.every((h, i) => h === expectedHeaders[i]);
  if (matches) { Logger.log(`✓ ${tabName}: schema OK`); return; }

  const lastRow = sheet.getLastRow();
  const migratedRows = [];
  if (lastRow > 1 && lastCol > 0) {
    const allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const oldIdx = {};
    currentHeaders.forEach((h, i) => { oldIdx[h] = i; });
    for (let r = 1; r < allValues.length; r++) {
      migratedRows.push(expectedHeaders.map(h => oldIdx[h] !== undefined ? allValues[r][oldIdx[h]] : ''));
    }
  }
  sheet.clear();
  sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (migratedRows.length > 0) {
    sheet.getRange(2, 1, migratedRows.length, expectedHeaders.length).setValues(migratedRows);
  }
  const added = expectedHeaders.filter(h => !currentHeaders.includes(h));
  const dropped = currentHeaders.filter(h => h && !expectedHeaders.includes(h));
  Logger.log(`✓ ${tabName}: migrated. Added [${added.join(', ')}] Dropped [${dropped.join(', ')}]. ${migratedRows.length} data rows preserved.`);
}
