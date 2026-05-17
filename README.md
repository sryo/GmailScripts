# GmailScripts

Personal Google Apps Script collection for keeping a Gmail inbox tidy.

## Scripts

**`cleanUp.gs`**. Schedules low-priority mail for deletion, keeps pinned/important state consistent, and trains a Gemini Flash classifier (shadow mode) on what you actually salvage or discard so the rules improve over time. See **Classifier setup** below.

![mail2web](https://github.com/user-attachments/assets/b83c71bb-186f-4964-8fb7-c84c5c66315b)

**`email2Web.gs`**. Publishes Gmail threads labeled `🌎` as a web page. Deploy as "Execute as: me" with access "Anyone with the link" at most; never "Anyone, even anonymous."

**`replyToEmails.gs`**. Drafts auto-replies to unread inbox threads when their body matches keywords listed in a spreadsheet.

**`tagEmailsByDomain.gs`**. Groups untagged threads under per-domain labels (Hey-style bundles).

## Classifier setup (one-time)

1. Project Settings, Script Properties, add `GEMINI_API_KEY` ([get one](https://aistudio.google.com/app/apikey)).
2. From the editor, run `harvestCorrections()` once to create the `GmailClassifier` spreadsheet and grant OAuth scopes.
3. Open the spreadsheet from your Drive to watch Training and Shadow rows accumulate.
4. The classifier abstains until ≥5 keep and ≥5 trash examples exist. Once warm, it logs disagreements to the `Shadow` tab without changing behavior. To act on its verdicts, flip `CLASSIFIER_SHADOW_MODE` to `false` in `_config.gs`.
