/*
Gemini Flash reply drafter. Builds a context from a thread plus the user's voice
examples (sent emails labeled 🫵) and asks Gemini for a short reply draft.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function generateReplyDraft(thread, voiceExamples, userEmail) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(PROPS.GEMINI_API_KEY);
  if (!apiKey) {
    console.log('drafter: GEMINI_API_KEY not set, abstaining.');
    return null;
  }
  const ctx = buildReplyContext_(thread, voiceExamples, userEmail);
  if (!ctx) return null;
  const result = callGemini_(buildReplyPrompt_(ctx), apiKey, { temperature: 0.3, logPrefix: 'drafter' });
  if (!result) return null;
  return { draft: result.draft || '', notes: result.notes || '', confidence: Number(result.confidence) || 0 };
}

function buildReplyContext_(thread, voiceExamples, userEmail) {
  const subject = thread.getFirstMessageSubject() || '';
  const messages = thread.getMessages().slice(-REPLY_THREAD_MESSAGE_WINDOW).map(m => ({
    from: m.getFrom(),
    date: m.getDate().toISOString(),
    body: stripQuotedReplyHistory_(m.getPlainBody() || '').substring(0, REPLY_MESSAGE_BODY_CAP)
  }));
  return { userEmail, subject, messages, voiceExamples: voiceExamples || [] };
}

function loadVoiceExamples_(userEmail) {
  const threads = GmailApp.search('from:me label:"' + LABEL_VOICE + '" -in:trash', 0, VOICE_EXAMPLES_MAX);
  if (threads.length === 0) return [];
  const lower = userEmail.toLowerCase();
  const messagesByThread = GmailApp.getMessagesForThreads(threads);
  return threads.map((t, i) => {
    const mine = messagesByThread[i].slice().reverse().find(m => m.getFrom().toLowerCase().includes(lower));
    const msg = mine || messagesByThread[i][0];
    return {
      subject: t.getFirstMessageSubject() || '',
      body: stripQuotedReplyHistory_(msg.getPlainBody() || '').substring(0, VOICE_EXAMPLE_BODY_CAP)
    };
  });
}

function stripQuotedReplyHistory_(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^On .+ wrote:\s*$/.test(line.trim())) break;
    if (/^>+/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

function buildReplyPrompt_(ctx) {
  const voiceBlock = ctx.voiceExamples.length === 0
    ? '(none specified)'
    : ctx.voiceExamples.map(e => `Subject: ${e.subject}\n${e.body}`).join('\n---\n');

  const messagesBlock = ctx.messages.map(m => `From: ${m.from}  (${m.date})\n${m.body}`).join('\n---\n');

  return `You draft a concise email reply on behalf of ${ctx.userEmail}.

Examples of how the user writes:
---
${voiceBlock}
---

Rules:
- Reply as ${ctx.userEmail} to the most recent message NOT from that address.
- Match the register of the incoming message. Default: plain, direct, conversational. No filler openings (no "Hope you're well"), no corporate stiffness.
- Reply in the same language as the most recent incoming message.
- Under 120 words unless the thread clearly demands more.
- Do NOT include a subject line, greeting boilerplate, or signature (Gmail adds the signature).
- If you must assume a fact the user hasn't stated, make a reasonable assumption and flag it in "notes".

Edge cases (return draft:"" with a notes line explaining):
- Thread has no message from anyone other than ${ctx.userEmail}.
- The most recent message is already from ${ctx.userEmail} (user already replied).

Thread subject: ${ctx.subject}

Messages (oldest first, quoted history removed):
---
${messagesBlock}
---

Respond with JSON only:
{"draft": "string", "confidence": 0.0-1.0, "notes": "string or empty"}`;
}
