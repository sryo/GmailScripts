/*
Tracks whether a cleanup pass actually did anything, so idle runs print a heartbeat in the log.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

const userProperties = PropertiesService.getUserProperties();
let lastCleanedTime = null;
let cleanedInCurrentIteration = false;

function initCleanRun_() {
  cleanedInCurrentIteration = false;
  lastCleanedTime = userProperties.getProperty(PROPS.LAST_CLEANED_TIME);
  if (lastCleanedTime == null) {
    lastCleanedTime = new Date().toISOString();
    userProperties.setProperty(PROPS.LAST_CLEANED_TIME, lastCleanedTime);
  }
}

function markCleaned_() {
  cleanedInCurrentIteration = true;
  lastCleanedTime = new Date().toISOString();
}

function logCleanDate() {
  if (cleanedInCurrentIteration) {
    userProperties.setProperty(PROPS.LAST_CLEANED_TIME, lastCleanedTime);
  } else {
    console.log("✨ All clean since " + lastCleanedTime);
  }
}
