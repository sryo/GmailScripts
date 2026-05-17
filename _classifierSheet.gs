/*
Classifier spreadsheet bootstrap and accessors.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

const SHEET_TAB_TRAINING = 'Training';
const SHEET_TAB_TRACKING = 'Tracking';
const SHEET_TAB_DECISIONS = 'Decisions';
const SHEET_TAB_WINS = 'Wins';

const TRAINING_HEADERS = ['timestamp', 'threadId', 'sender', 'subject', 'snippet', 'verdict', 'source'];
const TRACKING_HEADERS = ['threadId', 'type', 'timestamp'];
const DECISIONS_HEADERS = ['timestamp', 'threadId', 'sender', 'subject', 'function', 'gmailVerdict', 'llmVerdict', 'llmConfidence', 'actor'];
const WINS_HEADERS = ['computedAt', 'threadId', 'sender', 'subject', 'function', 'gmailVerdict', 'llmVerdict', 'actor', 'userVerdict', 'outcome', 'confidence'];

let _classifierSheetCache;
let _classifierTabsCache;

function getOrCreateClassifierSheet() {
  if (_classifierSheetCache) return _classifierSheetCache;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CLASSIFIER_SHEET_ID');
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); }
    catch (e) { console.log(`Stored CLASSIFIER_SHEET_ID invalid (${e.toString()}); creating fresh.`); }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(CLASSIFIER_SHEET_NAME);
    props.setProperty('CLASSIFIER_SHEET_ID', ss.getId());
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
