/*
One-shot label migration: renames old emoji-only labels to the new
emoji + descriptor names. Idempotent (skips if old name doesn't exist).
Run once via the GmailClassifier menu, then delete this file.
Author: Mateo Yadarola (teodalton@gmail.com)
*/

function migrateLabels() {
  const migrations = [
    { from: '🌎', to: LABEL_PUBLIC },
    { from: '↩️', to: LABEL_PING },
    { from: '🦾', to: LABEL_AUTOREPLY },
    { from: '🪎', to: LABEL_STASH },
    { from: '🫵', to: LABEL_VOICE }
  ];
  const labelMap = buildLabelMap();
  migrations.forEach(m => {
    const old = labelMap[m.from.toLowerCase()];
    if (!old) {
      Logger.log(`No label "${m.from}" found, skipping.`);
      return;
    }
    if (m.from === m.to) return;
    try {
      Gmail.Users.Labels.update({ name: m.to }, 'me', old.id);
      Logger.log(`Renamed: ${m.from} → ${m.to}`);
    } catch (e) {
      console.log(`Failed to rename ${m.from}: ${e.toString()}`);
    }
  });
}
