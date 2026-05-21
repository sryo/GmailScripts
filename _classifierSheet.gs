/*
Finds-or-creates the AI loop's Google Sheet and keeps its columns in sync.
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
  ensureSheet_(ss, SHEET_TAB_OBSERVATIONS, OBSERVATIONS_HEADERS);
  ensureSheet_(ss, SHEET_TAB_TRACKING, TRACKING_HEADERS);
  ensureSheet_(ss, SHEET_TAB_SCOREBOARD, SCOREBOARD_HEADERS);
  if (_spreadsheetFreshlyCreated) {
    const ourTabs = [SHEET_TAB_OBSERVATIONS, SHEET_TAB_TRACKING, SHEET_TAB_SCOREBOARD];
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
    observations: ss.getSheetByName(SHEET_TAB_OBSERVATIONS),
    tracking:     ss.getSheetByName(SHEET_TAB_TRACKING),
    scoreboard:   ss.getSheetByName(SHEET_TAB_SCOREBOARD)
  };
  return _classifierTabsCache;
}

function validate() {
  const ss = getOrCreateClassifierSheet();
  [
    { tab: SHEET_TAB_OBSERVATIONS, headers: OBSERVATIONS_HEADERS },
    { tab: SHEET_TAB_TRACKING,     headers: TRACKING_HEADERS },
    { tab: SHEET_TAB_SCOREBOARD,   headers: SCOREBOARD_HEADERS }
  ].forEach(s => migrateTab_(ss, s.tab, s.headers));

  // Sweep any legacy tabs from prior schema. We chose start-fresh; surfacing them here lets the
  // user decide whether to drop or archive them manually (we don't auto-delete user data).
  const knownTabs = new Set([SHEET_TAB_OBSERVATIONS, SHEET_TAB_TRACKING, SHEET_TAB_SCOREBOARD]);
  const legacy = ss.getSheets().map(s => s.getName()).filter(n => !knownTabs.has(n));
  if (legacy.length > 0) Logger.log('⚠ Legacy tabs present (safe to delete manually): ' + legacy.join(', '));
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
