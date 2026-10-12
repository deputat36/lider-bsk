from pathlib import Path

src=Path("android/build-src/sms-card-app/app/src/main/java/ru/etagi/borisoglebsk/smscard")

p=src/"BulkCampaignActivity.java"
s=p.read_text()
old='''                    .setPositiveButton("Создать", (d, w) -> {
                        BulkCampaignStore.Campaign campaign = BulkCampaignStore.Campaign.create(draftTitle, draftRendered, selected);
                        if (!BulkCampaignStore.saveActive(this, campaign)) {
                            Toast.makeText(this, "Не удалось сохранить очередь. Освободите место в памяти и попробуйте снова.", Toast.LENGTH_LONG).show();
                            return;
                        }
                        clearDraft();
                        showQueue();
                    })
'''
new='''                    .setPositiveButton("Создать", (d, w) -> {
                        create.setEnabled(false);
                        final String titleSnapshot = draftTitle;
                        final String messageSnapshot = draftRendered;
                        final List<ContactRepository.Item> selectedSnapshot = new ArrayList<>(selected);
                        // Bulk first-write runs off the UI thread on older, slower phones.
                        new Thread(() -> {
                            BulkCampaignStore.Campaign campaign = BulkCampaignStore.Campaign.create(
                                    titleSnapshot, messageSnapshot, selectedSnapshot);
                            boolean saved = BulkCampaignStore.saveActive(this, campaign);
                            runOnUiThread(() -> {
                                if (isFinishing() || isDestroyed()) return;
                                create.setEnabled(true);
                                if (!saved) {
                                    Toast.makeText(this, "Не удалось сохранить очередь. Проверьте память устройства.", Toast.LENGTH_LONG).show();
                                    return;
                                }
                                clearDraft();
                                showQueue();
                            });
                        }, "bulk-create").start();
                    })
'''
assert old in s
s=s.replace(old,new,1)
p.write_text(s)

p=src/"SqliteStores.java"
s=p.read_text()
old='''        database.beginTransaction();
        try {
            Map<Integer, String> prior = new HashMap<>();
'''
new='''        database.beginTransaction();
        try {
            // Never silently create a second active campaign.
            try (Cursor other = database.rawQuery(
                    "SELECT id FROM campaigns WHERE state='active' AND id!=? LIMIT 1",
                    new String[]{campaign.id})) {
                if (other.moveToFirst()) return false;
            }
            Map<Integer, String> prior = new HashMap<>();
'''
assert old in s
s=s.replace(old,new,1)
p.write_text(s)
print("Applied background campaign creation and duplicate-active campaign guard")
