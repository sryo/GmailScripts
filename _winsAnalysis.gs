/*
Joins Decisions × Training to score how often the LLM is validated by user behavior.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

const OUTCOME_PENDING = 'pending';
const OUTCOME_BOTH_RIGHT = 'both_right';
const OUTCOME_BOTH_WRONG = 'both_wrong';
const OUTCOME_LLM_WON = 'llm_won';
const OUTCOME_LLM_LOST = 'llm_lost';

const WINS_COL_ACTOR = WINS_HEADERS.indexOf('actor');
const WINS_COL_OUTCOME = WINS_HEADERS.indexOf('outcome');

function computeWins() {
  const tabs = getClassifierTabs();
  if (tabs.decisions.getLastRow() < 2) return;

  const decisionsData = tabs.decisions.getDataRange().getValues();
  const trainingData = tabs.training.getDataRange().getValues();

  const trainingByThread = {};
  for (let i = 1; i < trainingData.length; i++) {
    const [, threadId, , , , verdict] = trainingData[i];
    if (threadId) trainingByThread[threadId] = verdict;
  }

  const decisionsByThread = {};
  for (let i = 1; i < decisionsData.length; i++) {
    const [, threadId, sender, subject, fn, gmailVerdict, llmVerdict, confidence, actor] = decisionsData[i];
    if (threadId) decisionsByThread[threadId] = { sender, subject, fn, gmailVerdict, llmVerdict, confidence, actor };
  }

  const now = new Date().toISOString();
  const rows = [];
  Object.keys(decisionsByThread).forEach(threadId => {
    const d = decisionsByThread[threadId];
    const userVerdict = trainingByThread[threadId] || '';
    const outcome = computeOutcome_(d.gmailVerdict, d.llmVerdict, userVerdict);
    rows.push([now, threadId, d.sender, d.subject, d.fn, d.gmailVerdict, d.llmVerdict, d.actor, userVerdict, outcome, d.confidence]);
  });

  const wins = tabs.wins;
  if (wins.getLastRow() > 1) wins.getRange(2, 1, wins.getLastRow() - 1, WINS_HEADERS.length).clearContent();
  if (rows.length > 0) wins.getRange(2, 1, rows.length, WINS_HEADERS.length).setValues(rows);

  console.log('computeWins:', summarizeOutcomes_(rows));
}

function computeOutcome_(gmailVerdict, llmVerdict, userVerdict) {
  if (!userVerdict) return OUTCOME_PENDING;
  const llmRight = llmVerdict === userVerdict;
  const gmailRight = gmailVerdict === userVerdict;
  if (llmRight && gmailRight) return OUTCOME_BOTH_RIGHT;
  if (!llmRight && !gmailRight) return OUTCOME_BOTH_WRONG;
  if (llmRight) return OUTCOME_LLM_WON;
  return OUTCOME_LLM_LOST;
}

function summarizeOutcomes_(rows) {
  const counts = {};
  let llmDriven = 0;
  rows.forEach(r => {
    const outcome = r[WINS_COL_OUTCOME];
    counts[outcome] = (counts[outcome] || 0) + 1;
    if (r[WINS_COL_ACTOR] === ACTOR_LLM) llmDriven++;
  });
  counts.llm_driven_total = llmDriven;
  return counts;
}
