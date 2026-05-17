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
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); }
    catch (e) { console.log(`Stored CLASSIFIER_SHEET_ID invalid (${e.toString()}); creating fresh.`); }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(CLASSIFIER_SHEET_NAME);
    props.setProperty(PROPS.CLASSIFIER_SHEET_ID, ss.getId());
    _spreadsheetFreshlyCreated = true;
    Logger.log(`Created classifier sheet: ${ss.getUrl()}`);
  }
  ensureSheet_(ss, SHEET_TAB_TRAINING, TRAINING_HEADERS);
  ensureSheet_(ss, SHEET_TAB_TRACKING, TRACKING_HEADERS);
  ensureSheet_(ss, SHEET_TAB_DECISIONS, DECISIONS_HEADERS);
  ensureSheet_(ss, SHEET_TAB_WINS, WINS_HEADERS);
  _classifierSheetCache = ss;
  return ss;
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
    Logger.log('(skipped validate — spreadsheet just created with current schema)');
  } else {
    validate();
  }
  const apiKey = PropertiesService.getScriptProperties().getProperty(PROPS.GEMINI_API_KEY);
  Logger.log(apiKey
    ? `✓ GEMINI_API_KEY is set (length ${apiKey.length})`
    : `⚠ GEMINI_API_KEY not set. Project Settings → Script Properties → add it.`);
  Logger.log(`Classifier shadow mode: ${CLASSIFIER_SHADOW_MODE ? 'ON (logging only)' : 'OFF (LLM gates decisions)'}`);
  Logger.log('--- install complete ---');
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
