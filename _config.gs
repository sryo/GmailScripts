/*
Shared constants.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

const LABEL_AUTOREPLY = '🤖';
const LABEL_PUBLIC = '🌎';
const LABEL_PRETRASH = '🗑️';

const MAX_THREADS_PUBLISH = 100;
const MAX_THREADS_TAG = 25;

const EXECUTION_TIME_LIMIT_MS = 5 * 60 * 1000;
const WEBAPP_CACHE_TTL_SEC = 60;

const CLASSIFIER_SHEET_NAME = 'GmailClassifier';
const CLASSIFIER_MIN_EXAMPLES_PER_CLASS = 5;
const CLASSIFIER_FEWSHOT_PER_CLASS = 10;
const CLASSIFIER_BATCH_SIZE = 20;
const CLASSIFIER_CONFIDENCE_THRESHOLD = 0.7;
const CLASSIFIER_SHADOW_MODE = true;
const GEMINI_MODEL = 'gemini-2.5-flash';
const HARVEST_LOOKBACK_DAYS = 20;

const CLASSIFIER_MODE_TRASH = 'should_trash';
const CLASSIFIER_MODE_PINNED = 'pinned_check';

const VERDICT_KEEP = 'keep';
const VERDICT_TRASH = 'trash';

const ACTOR_GMAIL = 'gmail';
const ACTOR_LLM = 'llm';

const OUTCOME_PENDING = 'pending';
const OUTCOME_BOTH_RIGHT = 'both_right';
const OUTCOME_BOTH_WRONG = 'both_wrong';
const OUTCOME_LLM_WON = 'llm_won';
const OUTCOME_LLM_LOST = 'llm_lost';

const SHEET_TAB_TRAINING = 'Training';
const SHEET_TAB_TRACKING = 'Tracking';
const SHEET_TAB_DECISIONS = 'Decisions';
const SHEET_TAB_WINS = 'Wins';

const TRAINING_HEADERS = ['timestamp', 'threadId', 'sender', 'subject', 'snippet', 'verdict', 'source'];
const TRACKING_HEADERS = ['threadId', 'type', 'timestamp'];
const DECISIONS_HEADERS = ['timestamp', 'threadId', 'sender', 'subject', 'function', 'gmailVerdict', 'llmVerdict', 'llmConfidence', 'actor'];
const WINS_HEADERS = ['computedAt', 'threadId', 'sender', 'subject', 'function', 'gmailVerdict', 'llmVerdict', 'actor', 'userVerdict', 'outcome', 'confidence'];

const PROPS = {
  LAST_CLEANED_TIME: 'lastCleanedTime',
  OFFSET: 'offset',
  CLASSIFIER_SHEET_ID: 'CLASSIFIER_SHEET_ID',
  GEMINI_API_KEY: 'GEMINI_API_KEY'
};
