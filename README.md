# GmailScripts

Personal Google Apps Script collection for keeping a Gmail inbox tidy.

## The five

1. **Hot.** Inbox is important mail that's either unread or younger than a day. New senders land in Hot or Meh by your first call: mark important to let them in, unimportant to filter them out. The LLM learns from each call.
2. **Meh.** Pretrash is a browsing space for newsletters and low-priority mail. Salvage means "keep this kind." Auto deletes after 20 days if untouched.
3. **Ping.** Read mail two or three days old with no reply gets resurfaced to Hot. Remove the marker and it's archived for good. Resurfaced at most once per thread.
4. **Bunch.** Per domain labels for one click access to all conversations with a sender.
5. **Stash.** Important threads carrying an attachment get a label for easy retrieval.

If this approach resonates, check out [Posta](https://sryo.github.io/Posta/), my opinionated take on a mail client.

## The way

* Gmail's importance flag is the single source of truth.
* The LLM is a corrective layer over Gmail, not a parallel system.
* Salvage, promote, and demote are training signals.
* Reversible by default: pretrash before trash, classifier acts only when confident enough.

## Scripts

**`cleanUp.gs`**. Schedules low-priority mail for deletion, keeps pinned/important state consistent, and trains a Gemini Flash classifier (shadow mode) on what you actually salvage or discard so the rules improve over time. See **Classifier setup** below.

![mail2web](https://github.com/user-attachments/assets/b83c71bb-186f-4964-8fb7-c84c5c66315b)

**`email2Web.gs`**. Publishes Gmail threads labeled `🌎` as a web page. Deploy as "Execute as: me" with access "Anyone with the link" at most; never "Anyone, even anonymous."

**`riff.gs`**. Apply `🦾` to any thread to add some AI muscle. Riff uses recent sent emails labeled `🫵` to match your voice.

**`bunch.gs`**. Groups important untagged threads under per-domain labels.

## Classifier setup (one-time)

1. Add `GEMINI_API_KEY` to Script Properties ([get one](https://aistudio.google.com/app/apikey)).
2. Run `install()` from the editor. It creates the spreadsheet, sets up the triggers, and confirms Gmail's Advanced Service is enabled.
3. Flip `CLASSIFIER_SHADOW_MODE` to `false` in `_config.gs` when you want the LLM to act on its verdicts.

The classifier abstains until ~5 keep and ~5 trash examples accumulate in `Training` from your salvage/demote behavior.
