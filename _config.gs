/*
Shared constants.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

const LABEL_AUTOREPLY = '🤖';
const LABEL_PUBLIC = '🌎';

const MAX_THREADS_PUBLISH = 100;
const MAX_THREADS_TAG = 25;

const EXECUTION_TIME_LIMIT_MS = 5 * 60 * 1000;
const WEBAPP_CACHE_TTL_SEC = 60;

const LABEL_PRETRASH = '🗑️';
const CLASSIFIER_SHEET_NAME = 'GmailClassifier';
const CLASSIFIER_MIN_EXAMPLES_PER_CLASS = 5;
const CLASSIFIER_FEWSHOT_PER_CLASS = 10;
const CLASSIFIER_BATCH_SIZE = 20;
const CLASSIFIER_CONFIDENCE_THRESHOLD = 0.7;
const CLASSIFIER_SHADOW_MODE = true;
const GEMINI_MODEL = 'gemini-2.5-flash';
const HARVEST_LOOKBACK_DAYS = 20;
