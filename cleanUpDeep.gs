/*
Deep pass: observe Gmail's importance calls, predict with Gemini, settle past flips,
act if shadow mode is off, then run other deep features (riff, burndown).
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function cleanUpDeep() {
  initCleanRun_();

  safely_('observePass',             observePass);
  safely_('predictPass',             predictPass);
  safely_('settlePass',              settlePass);
  safely_('applyClassifierActions',  applyClassifierActions);
  safely_('riff',                    riff);
  safely_('processBurndownReplies_', processBurndownReplies_);
  logCleanDate();
}

// Retention + scoreboard run once a day. They scan the full Observations sheet, and the user
// doesn't need either to be fresher than 24h. Wired in ensureTriggers_.
function dailyMaintenance() {
  safely_('pruneObservations_', pruneObservations_);
  safely_('pruneTracking_',     pruneTracking_);
  safely_('rebuildScoreboard',  rebuildScoreboard);
}
