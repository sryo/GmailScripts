/*
Apply 🦾 to any thread to add some AI muscle. Riff uses recent sent emails
labeled 🫵 to match your voice.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function riff() {
  const tabs = getClassifierTabs();
  const trackingValues = tabs.tracking.getDataRange().getValues();
  const drafted = buildTrackingIndex(trackingValues)[TRACKING_TYPE_DRAFTED];
  const threads = GmailApp.search('label:"' + LABEL_AUTOREPLY + '" -in:trash', 0, AUTOREPLY_BATCH_LIMIT);
  if (threads.length === 0) return;

  const autoreply = GmailApp.getUserLabelByName(LABEL_AUTOREPLY);
  const draftedThreadIds = buildDraftThreadIdSet_();
  const rowsToDelete = {};

  // Computed once per batch; reused across all drafted threads.
  const userEmail = Gmail.Users.getProfile('me').emailAddress;
  const voiceExamples = loadVoiceExamples_(userEmail);
  if (voiceExamples.length > 0) Logger.log('🫵 Voicing with ' + voiceExamples.length + ' samples.');

  threads.forEach(t => {
    try {
      const threadId = t.getId();
      const wasDrafted = !!drafted[threadId];
      const hasDraft = draftedThreadIds.has(threadId);

      // Tracked and the draft is gone: sent (remove 🦾) or discarded (keep 🦾, will redraft).
      if (wasDrafted && !hasDraft) {
        const draftedAt = trackingValues[drafted[threadId] - 1][2];
        rowsToDelete[drafted[threadId]] = true;
        if (wasReplySentAfter_(t, userEmail, draftedAt)) {
          autoreply.removeFromThreads([t]);
          Logger.log('🦾 Riff sent for ' + threadId + '.');
        } else {
          Logger.log('🦾 Riff discarded on ' + threadId + ', will redraft.');
        }
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
        Logger.log('🦾 Riff skipped ' + threadId + ' (' + (result.notes || 'no draft returned') + ').');
        autoreply.removeFromThreads([t]);
        return;
      }

      if (AUTOREPLY_DRY_RUN) {
        Logger.log('🦾 [DRY RUN] would draft for ' + threadId + ':\n' + result.draft);
      } else {
        const { body, htmlBody } = buildReplyBody_(t, result.draft, userEmail);
        t.createDraftReply(body, { htmlBody });
        t.moveToInbox();
        t.markUnread();
      }
      recordTrackingRows([threadId], TRACKING_TYPE_DRAFTED);
      Logger.log('🦾 Riffing reply for ' + threadId + '.');
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

// Quoted-original block so recipients see context — matches Gmail's Reply UI output.
function buildReplyBody_(thread, draftText, userEmail) {
  const lower = userEmail.toLowerCase();
  const original = thread.getMessages().slice().reverse().find(m => !m.getFrom().toLowerCase().includes(lower));
  const escapedDraft = escapeHtml(draftText).replace(/\n/g, '<br>');
  if (!original) return { body: draftText, htmlBody: `<div>${escapedDraft}</div>` };

  const attribution = `On ${formatReplyDate_(original.getDate())}, ${original.getFrom()} wrote:`;
  const quotedPlain = (original.getPlainBody() || '').split('\n').map(l => '> ' + l).join('\n');
  const body = `${draftText}\n\n${attribution}\n${quotedPlain}`;

  const htmlBody =
    `<div>${escapedDraft}</div>` +
    `<div><br></div>` +
    `<div>${escapeHtml(attribution)}</div>` +
    `<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex;">${original.getBody() || ''}</blockquote>`;

  return { body, htmlBody };
}

function formatReplyDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "EEE, MMM d, yyyy 'at' h:mm a");
}

function wasReplySentAfter_(thread, userEmail, sinceTimestamp) {
  const since = new Date(sinceTimestamp);
  const lower = userEmail.toLowerCase();
  return thread.getMessages().some(m =>
    m.getFrom().toLowerCase().includes(lower) && m.getDate() > since
  );
}
