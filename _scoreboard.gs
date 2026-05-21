/*
Aggregates settled observations into an LLM-vs-Gmail-vs-truth scoreboard.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function rebuildScoreboard() {
  const tabs = getClassifierTabs();
  const sheet = tabs.observations;
  if (sheet.getLastRow() < 2) return;
  const data = sheet.getDataRange().getValues();
  const col = observationsColMap_();

  const rows = [];
  rows.push(scoreboardRowForWindow_(data, col, 7));
  rows.push(scoreboardRowForWindow_(data, col, 30));
  rows.push(scoreboardRowForWindow_(data, col, 0)); // 0 = all-time

  const board = tabs.scoreboard;
  if (board.getLastRow() > 1) board.getRange(2, 1, board.getLastRow() - 1, SCOREBOARD_HEADERS.length).clearContent();
  board.getRange(2, 1, rows.length, SCOREBOARD_HEADERS.length).setValues(rows);

  Logger.log('📊 Scoreboard: ' + rows.map(r => r[1] + '=' + (r[5] * 100).toFixed(0) + '%/' + (r[6] * 100).toFixed(0) + '%').join(' '));
}

function scoreboardRowForWindow_(data, col, windowDays) {
  const cutoff = windowDays > 0 ? Date.now() - windowDays * 24 * 3600 * 1000 : 0;
  let observed = 0, pending = 0, settled = 0;
  let gmailCorrect = 0, llmCorrect = 0, llmPredictions = 0;
  let llmWins = 0, llmLosses = 0, bothRight = 0, bothWrong = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const obsAt = Date.parse(r[col.observedAt]);
    if (isNaN(obsAt)) continue;
    if (obsAt < cutoff) continue;
    observed++;
    if (r[col.state] === OBS_STATE_PENDING) { pending++; continue; }
    if (r[col.state] === OBS_STATE_EXPIRED) continue;
    settled++;
    const truth = r[col.truthVerdict];
    const gmail = r[col.gmailVerdict];
    const llm = r[col.llmVerdict];
    if (gmail === truth) gmailCorrect++;
    if (llm) {
      llmPredictions++;
      const llmRight = llm === truth;
      const gmailRight = gmail === truth;
      if (llmRight) llmCorrect++;
      if (llmRight && gmailRight) bothRight++;
      else if (!llmRight && !gmailRight) bothWrong++;
      else if (llmRight && !gmailRight) llmWins++;
      else if (!llmRight && gmailRight) llmLosses++;
    }
  }

  return [
    new Date().toISOString(),
    windowDays > 0 ? (windowDays + 'd') : 'all',
    observed, settled, pending,
    settled > 0 ? gmailCorrect / settled : 0,
    llmPredictions > 0 ? llmCorrect / llmPredictions : 0,
    settled > 0 ? llmPredictions / settled : 0,
    llmWins, llmLosses, bothRight, bothWrong
  ];
}
