/*
Apply 🦾 to any thread to add some AI muscle. Riff uses recent sent emails
labeled 🫵 to match your voice.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function riff() {
  const tabs = getClassifierTabs();
  const drafted = buildTrackingIndex(tabs.tracking.getDataRange().getValues())[TRACKING_TYPE_DRAFTED];
  const threads = GmailApp.search('label:"' + LABEL_AUTOREPLY + '" -in:trash', 0, AUTOREPLY_BATCH_LIMIT);
  if (threads.length === 0) return;

  const autoreply = GmailApp.getUserLabelByName(LABEL_AUTOREPLY);
  const draftedThreadIds = buildDraftThreadIdSet_();
  const rowsToDelete = {};

  // Computed once per batch; reused across all drafted threads.
  const userEmail = Gmail.Users.getProfile('me').emailAddress;
  const voiceExamples = loadVoiceExamples_(userEmail);

  threads.forEach(t => {
    try {
      const threadId = t.getId();
      const wasDrafted = !!drafted[threadId];
      const hasDraft = draftedThreadIds.has(threadId);

      // Tracked and the draft is gone (sent or deleted): lifecycle complete, remove 🦾.
      if (wasDrafted && !hasDraft) {
        autoreply.removeFromThreads([t]);
        rowsToDelete[drafted[threadId]] = true;
        Logger.log(LABEL_AUTOREPLY + ' Draft completed on ' + threadId + ', removing label.');
        return;
      }

      // Has a draft already (ours or the user's). Track if we hadn't, then leave alone.
      if (hasDraft) {
        if (!wasDrafted) recordTrackingRows([threadId], TRACKING_TYPE_DRAFTED);
        return;
      }

      // No draft yet: generate one.
      const result = generateReplyDraft(t, voiceExamples, userEmail);
      if (!result) return; // abstain on API failure, retry next tick
      if (!result.draft) {
        Logger.log(LABEL_AUTOREPLY + ' Skipping ' + threadId + ' (' + (result.notes || 'no draft returned') + ').');
        autoreply.removeFromThreads([t]);
        return;
      }

      if (AUTOREPLY_DRY_RUN) {
        Logger.log(LABEL_AUTOREPLY + ' [DRY RUN] would draft for ' + threadId + ':\n' + result.draft);
      } else {
        t.createDraftReply(result.draft);
      }
      recordTrackingRows([threadId], TRACKING_TYPE_DRAFTED);
      Logger.log(LABEL_AUTOREPLY + ' Drafted reply for ' + threadId + '.');
    } catch (e) {
      console.log('riff ' + t.getId() + ': ' + e.toString());
    }
  });

  const deleteList = Object.keys(rowsToDelete).map(Number);
  if (deleteList.length > 0) deleteRowsReverse(tabs.tracking, deleteList);
}

function buildDraftThreadIdSet_() {
  const set = new Set();
  GmailApp.getDrafts().forEach(d => {
    try { set.add(d.getMessage().getThread().getId()); } catch (e) { /* dangling draft */ }
  });
  return set;
}
