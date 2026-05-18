/*
Shared constants.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

const LABEL_AUTOREPLY = '🦾 Riff';
const LABEL_PUBLIC = '🌎 Public';
const LABEL_PRETRASH = '🗑️';
const LABEL_PING = '↩️ Ping';
const LABEL_STASH = '🪎 Stash';
const LABEL_VOICE = '🫵 Voice';

// Labels removeEmptyLabels must never delete, even when empty.
const PROTECTED_LABELS = [LABEL_AUTOREPLY, LABEL_PUBLIC, LABEL_PRETRASH, LABEL_PING, LABEL_STASH, LABEL_VOICE];

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
const PRETRASH_AGE_DAYS = 20;
const ARCHIVE_INBOX_AGE_DAYS = 1;
const PING_PICKUP_DAYS = 2;
const PING_EXPIRE_DAYS = 4;
const PROMOTE_LOOKBACK_DAYS = 14;
const HARVEST_BATCH_LIMIT = 100;
const BOOTSTRAP_SAMPLE_SIZE = 100;
const AUTOREPLY_BATCH_LIMIT = 5;
const AUTOREPLY_DRY_RUN = false;
const VOICE_EXAMPLES_MAX = 5; // recommended; do not exceed 10 or prompt grows unwieldy
const VOICE_EXAMPLE_BODY_CAP = 500;
const REPLY_THREAD_MESSAGE_WINDOW = 5;
const REPLY_MESSAGE_BODY_CAP = 4000;
const CLASSIFIED_IMPORTANCE_TTL_DAYS = 7;
const LLM_DEMOTED_TTL_DAYS = 30;
const LLM_PROMOTED_TTL_DAYS = 30;
const DECISIONS_TTL_DAYS = 60;

const VERDICT_KEEP = 'keep';
const VERDICT_TRASH = 'trash';

const ACTOR_GMAIL = 'gmail';
const ACTOR_LLM = 'llm';

const OUTCOME_PENDING = 'pending';
const OUTCOME_BOTH_RIGHT = 'both_right';
const OUTCOME_BOTH_WRONG = 'both_wrong';
const OUTCOME_LLM_WON = 'llm_won';
const OUTCOME_LLM_LOST = 'llm_lost';

const TRACKING_TYPE_PRETRASHED = 'pretrashed';
const TRACKING_TYPE_IMPORTANT_SEEN = 'important_seen';
const TRACKING_TYPE_CLASSIFIED_IMPORTANCE = 'classified_importance';
const TRACKING_TYPE_LLM_DEMOTED = 'llm_demoted';
const TRACKING_TYPE_UNIMPORTANT_SEEN = 'unimportant_seen';
const TRACKING_TYPE_LLM_PROMOTED = 'llm_promoted';
const TRACKING_TYPE_PINGED = 'pinged';
const TRACKING_TYPE_DRAFTED = 'drafted';

const SOURCE_SALVAGED = 'salvaged';
const SOURCE_DEMOTED_IMPORTANT = 'demoted_important';
const SOURCE_PROMOTED_UNIMPORTANT = 'promoted_unimportant';
const SOURCE_BOOTSTRAP = 'bootstrap';

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

const TRIGGER_CLEANUP_MIN = 5;
const TRIGGER_BUNCH_MIN = 1;
const TRIGGER_REMOVE_EMPTY_LABELS_MIN = 30;
const MENU_HANDLER = 'addClassifierMenu';
