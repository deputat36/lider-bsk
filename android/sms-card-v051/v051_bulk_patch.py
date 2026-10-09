from pathlib import Path

root = Path("android/build-src/sms-card-app")

def one(s, old, new, label):
    if old not in s:
        raise RuntimeError(f"{label}: marker not found")
    return s.replace(old, new, 1)

p = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard/BulkCampaignActivity.java"
s = p.read_text()

s = one(s,
'''import java.util.List;
import java.util.Locale;
import java.util.Set;
''',
'''import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
''', "bulk imports")

s = one(s,
'''        box.addView(sectionTitle("История рассылок"), topMargin(24));
''',
'''        box.addView(sectionTitle("Стоп-лист"), topMargin(24));
        LinearLayout stopCard = card();
        stopCard.addView(body("Номеров в стоп-листе: " + RecipientPolicyStore.blacklistCount(this)));
        Button manageStop = secondaryButton("Открыть стоп-лист");
        manageStop.setOnClickListener(v -> showBlacklist());
        stopCard.addView(manageStop, topMargin(8));
        box.addView(stopCard);

        box.addView(sectionTitle("История рассылок"), topMargin(24));
''', "stop list dashboard")

s = one(s,
'''        EditText search = edit("Поиск по имени или номеру", InputType.TYPE_CLASS_TEXT);
        controls.addView(search, topMargin(10));

        LinearLayout actions = new LinearLayout(this);
''',
'''        EditText search = edit("Поиск по имени или номеру", InputType.TYPE_CLASS_TEXT);
        controls.addView(search, topMargin(10));

        CheckBox onlyMobile = new CheckBox(this);
        onlyMobile.setText("Только мобильные номера");
        onlyMobile.setChecked(true);
        onlyMobile.setTextColor(BLACK);
        controls.addView(onlyMobile, topMargin(6));

        int recentDays = AppPrefs.repeatDays(this);
        CheckBox excludeRecent = new CheckBox(this);
        excludeRecent.setText(recentDays > 0
                ? "Исключить обработанных за последние " + recentDays + " дн."
                : "Исключать недавно обработанных (период выключен в Настройках)");
        excludeRecent.setChecked(recentDays > 0);
        excludeRecent.setEnabled(recentDays > 0);
        excludeRecent.setTextColor(BLACK);
        controls.addView(excludeRecent);
        controls.addView(small("Стоп-лист исключается всегда. Городские и рабочие номера можно показать, сняв фильтр «Только мобильные»."), topMargin(4));

        LinearLayout actions = new LinearLayout(this);
''', "contact filters controls")

s = one(s,
'''        actions.addView(selectAll, new LinearLayout.LayoutParams(0, dp(44), 1f));
        LinearLayout.LayoutParams clearLp = new LinearLayout.LayoutParams(0, dp(44), 1f);
''',
'''        actions.addView(selectAll, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams clearLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
''', "contact buttons adaptive")

s = one(s,
'''                contactAdapter = new ContactSelectionAdapter(contacts, () -> {
                    selectedText.setText("Выбрано: " + contactAdapter.selectedCount());
                    status.setText("Найдено: " + contactAdapter.visibleCount() + " • всего уникальных номеров: " + contactAdapter.totalCount());
                });
                list.setAdapter(contactAdapter);
                status.setText("Найдено: " + contacts.size() + " уникальных номеров");
                selectedText.setText("Выбрано: 0");
''',
'''                long cutoff = recentDays > 0
                        ? System.currentTimeMillis() - TimeUnit.DAYS.toMillis(recentDays)
                        : Long.MAX_VALUE;
                Set<String> recent = recentDays > 0
                        ? RecipientPolicyStore.preparedSince(this, cutoff)
                        : new LinkedHashSet<>();
                Set<String> blocked = RecipientPolicyStore.blacklistedNumbers(this);
                contactAdapter = new ContactSelectionAdapter(contacts, recent, blocked, () -> {
                    selectedText.setText("Выбрано: " + contactAdapter.selectedCount());
                    status.setText("Показано: " + contactAdapter.visibleCount() + " • всего уникальных номеров: " + contactAdapter.totalCount());
                });
                list.setAdapter(contactAdapter);
                contactAdapter.filter(search.getText().toString(), onlyMobile.isChecked(), excludeRecent.isChecked());
                selectedText.setText("Выбрано: 0");
''', "adapter create")

s = one(s,
'''        search.addTextChangedListener(new SimpleTextWatcher(() -> {
            if (contactAdapter != null) contactAdapter.filter(search.getText().toString());
        }));
''',
'''        Runnable applyFilters = () -> {
            if (contactAdapter != null) {
                contactAdapter.filter(search.getText().toString(), onlyMobile.isChecked(), excludeRecent.isChecked());
            }
        };
        search.addTextChangedListener(new SimpleTextWatcher(applyFilters));
        onlyMobile.setOnCheckedChangeListener((button, checked) -> applyFilters.run());
        excludeRecent.setOnCheckedChangeListener((button, checked) -> applyFilters.run());
''', "filter listeners")

s = one(s,
'''                        BulkCampaignStore.Campaign campaign = BulkCampaignStore.Campaign.create(draftTitle, draftRendered, selected);
                        BulkCampaignStore.saveActive(this, campaign);
                        clearDraft();
                        showQueue();
''',
'''                        BulkCampaignStore.Campaign campaign = BulkCampaignStore.Campaign.create(draftTitle, draftRendered, selected);
                        if (!BulkCampaignStore.saveActive(this, campaign)) {
                            Toast.makeText(this, "Не удалось сохранить очередь. Освободите место в памяти и попробуйте снова.", Toast.LENGTH_LONG).show();
                            return;
                        }
                        clearDraft();
                        showQueue();
''', "create save failure")

s = one(s,
'''        campaign.paused = false;
        campaign.advanceIndex();
        if (campaign.complete()) {
            BulkCampaignStore.finish(this, campaign, false);
            Toast.makeText(this, "Рассылка завершена", Toast.LENGTH_LONG).show();
            showDashboard();
            return;
        }
        BulkCampaignStore.saveActive(this, campaign);

        BulkCampaignStore.Recipient recipient = campaign.current();
''',
'''        campaign.paused = false;
        campaign.advanceIndex();
        skipBlacklistedRecipients(campaign);
        if (campaign.complete()) {
            if (!BulkCampaignStore.finish(this, campaign, false)) {
                Toast.makeText(this, "Не удалось сохранить завершение рассылки", Toast.LENGTH_LONG).show();
                return;
            }
            Toast.makeText(this, "Рассылка завершена", Toast.LENGTH_LONG).show();
            showDashboard();
            return;
        }
        if (!BulkCampaignStore.saveActive(this, campaign)) {
            Toast.makeText(this, "Не удалось сохранить состояние очереди", Toast.LENGTH_LONG).show();
            return;
        }

        BulkCampaignStore.Recipient recipient = campaign.current();
''', "queue initial save")

s = one(s,
'''        Button pause = secondaryButton("Пауза и выйти из очереди");
''',
'''        Button blacklist = secondaryButton("В стоп-лист и пропустить");
        blacklist.setOnClickListener(v -> {
            if (!RecipientPolicyStore.setBlacklisted(this, recipient.phone, recipient.name, true)) {
                Toast.makeText(this, "Не удалось сохранить стоп-лист", Toast.LENGTH_LONG).show();
                return;
            }
            skipAndNext(campaign, recipient);
        });
        box.addView(blacklist, topMargin(12));

        Button pause = secondaryButton("Пауза и выйти из очереди");
''', "queue blacklist")

s = one(s,
'''        pause.setOnClickListener(v -> {
            campaign.paused = true;
            BulkCampaignStore.saveActive(this, campaign);
            showDashboard();
        });
''',
'''        pause.setOnClickListener(v -> {
            campaign.paused = true;
            if (!BulkCampaignStore.saveActive(this, campaign)) {
                campaign.paused = false;
                Toast.makeText(this, "Не удалось сохранить паузу", Toast.LENGTH_LONG).show();
                return;
            }
            showDashboard();
        });
''', "pause save")

s = one(s,
'''    private void openCampaignSms(BulkCampaignStore.Campaign campaign, BulkCampaignStore.Recipient recipient) {
        recipient.status = BulkCampaignStore.STATUS_OPENED;
        BulkCampaignStore.saveActive(this, campaign);

        Intent intent = new Intent(this, SmsComposeActivity.class)
''',
'''    private void openCampaignSms(BulkCampaignStore.Campaign campaign, BulkCampaignStore.Recipient recipient) {
        String oldStatus = recipient.status;
        recipient.status = BulkCampaignStore.STATUS_OPENED;
        if (!BulkCampaignStore.saveActive(this, campaign)) {
            recipient.status = oldStatus;
            Toast.makeText(this, "Не удалось сохранить состояние очереди", Toast.LENGTH_LONG).show();
            return;
        }

        Intent intent = new Intent(this, SmsComposeActivity.class)
''', "open save")

s = one(s,
'''    private void markPreparedAndNext(BulkCampaignStore.Campaign campaign, BulkCampaignStore.Recipient recipient) {
        recipient.status = BulkCampaignStore.STATUS_PREPARED;
        HistoryStore.add(this, recipient.phone, "bulk", campaign.title);
        campaign.currentIndex++;
        campaign.advanceIndex();
        if (campaign.complete()) {
            BulkCampaignStore.finish(this, campaign, false);
            Toast.makeText(this, "Рассылка завершена", Toast.LENGTH_LONG).show();
            showDashboard();
        } else {
            BulkCampaignStore.saveActive(this, campaign);
            showQueue();
        }
    }

    private void skipAndNext(BulkCampaignStore.Campaign campaign, BulkCampaignStore.Recipient recipient) {
        recipient.status = BulkCampaignStore.STATUS_SKIPPED;
        campaign.currentIndex++;
        campaign.advanceIndex();
        if (campaign.complete()) {
            BulkCampaignStore.finish(this, campaign, false);
            Toast.makeText(this, "Рассылка завершена", Toast.LENGTH_LONG).show();
            showDashboard();
        } else {
            BulkCampaignStore.saveActive(this, campaign);
            showQueue();
        }
    }
''',
'''    private void markPreparedAndNext(BulkCampaignStore.Campaign campaign, BulkCampaignStore.Recipient recipient) {
        String oldStatus = recipient.status;
        int oldIndex = campaign.currentIndex;
        recipient.status = BulkCampaignStore.STATUS_PREPARED;
        campaign.currentIndex++;
        campaign.advanceIndex();

        boolean complete = campaign.complete();
        boolean saved = complete
                ? BulkCampaignStore.finish(this, campaign, false)
                : BulkCampaignStore.saveActive(this, campaign);
        if (!saved) {
            recipient.status = oldStatus;
            campaign.currentIndex = oldIndex;
            Toast.makeText(this, "Не удалось сохранить прогресс. Попробуйте ещё раз.", Toast.LENGTH_LONG).show();
            return;
        }

        HistoryStore.add(this, recipient.phone, "bulk", campaign.title);
        if (complete) {
            Toast.makeText(this, "Рассылка завершена", Toast.LENGTH_LONG).show();
            showDashboard();
        } else {
            showQueue();
        }
    }

    private void skipAndNext(BulkCampaignStore.Campaign campaign, BulkCampaignStore.Recipient recipient) {
        String oldStatus = recipient.status;
        int oldIndex = campaign.currentIndex;
        recipient.status = BulkCampaignStore.STATUS_SKIPPED;
        campaign.currentIndex++;
        campaign.advanceIndex();

        boolean complete = campaign.complete();
        boolean saved = complete
                ? BulkCampaignStore.finish(this, campaign, false)
                : BulkCampaignStore.saveActive(this, campaign);
        if (!saved) {
            recipient.status = oldStatus;
            campaign.currentIndex = oldIndex;
            Toast.makeText(this, "Не удалось сохранить прогресс. Попробуйте ещё раз.", Toast.LENGTH_LONG).show();
            return;
        }

        if (complete) {
            Toast.makeText(this, "Рассылка завершена", Toast.LENGTH_LONG).show();
            showDashboard();
        } else {
            showQueue();
        }
    }
''', "mark skip safe")

s = one(s,
'''                .setPositiveButton("Отменить рассылку", (d, w) -> {
                    BulkCampaignStore.finish(this, campaign, true);
                    showDashboard();
                })
''',
'''                .setPositiveButton("Отменить рассылку", (d, w) -> {
                    if (!BulkCampaignStore.finish(this, campaign, true)) {
                        Toast.makeText(this, "Не удалось сохранить отмену рассылки", Toast.LENGTH_LONG).show();
                        return;
                    }
                    showDashboard();
                })
''', "cancel save")

s = one(s,
'''    private String progressText(BulkCampaignStore.Campaign campaign) {
''',
'''    private void skipBlacklistedRecipients(BulkCampaignStore.Campaign campaign) {
        boolean changed = false;
        while (campaign.current() != null && RecipientPolicyStore.isBlacklisted(this, campaign.current().phone)) {
            campaign.current().status = BulkCampaignStore.STATUS_SKIPPED;
            campaign.currentIndex++;
            campaign.advanceIndex();
            changed = true;
        }
        if (changed) BulkCampaignStore.saveActive(this, campaign);
    }

    private void showBlacklist() {
        LinearLayout root = baseRoot("Стоп-лист", false);
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = pageBox();
        scroll.addView(box);

        List<RecipientPolicyStore.BlockedItem> items = RecipientPolicyStore.blacklist(this);
        if (items.isEmpty()) {
            box.addView(body("Стоп-лист пуст. Добавить номер можно прямо из очереди рассылки."));
        } else {
            for (RecipientPolicyStore.BlockedItem item : items) {
                LinearLayout row = card();
                row.addView(title(item.label.isEmpty() ? PhoneNormalizer.display(item.phone) : item.label));
                row.addView(body(PhoneNormalizer.display(item.phone)), topMargin(4));
                Button remove = secondaryButton("Убрать из стоп-листа");
                remove.setOnClickListener(v -> {
                    RecipientPolicyStore.setBlacklisted(this, item.phone, item.label, false);
                    showBlacklist();
                });
                row.addView(remove, topMargin(8));
                box.addView(row, topMargin(8));
            }

            Button clear = secondaryButton("Очистить весь стоп-лист");
            clear.setOnClickListener(v -> new AlertDialog.Builder(this)
                    .setTitle("Очистить стоп-лист?")
                    .setPositiveButton("Очистить", (d, w) -> {
                        RecipientPolicyStore.clearBlacklist(this);
                        showBlacklist();
                    })
                    .setNegativeButton("Отмена", null)
                    .show());
            box.addView(clear, topMargin(16));
        }

        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private String progressText(BulkCampaignStore.Campaign campaign) {
''', "blacklist methods")

s = one(s,
'''        e.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)));
''',
'''        e.setMinHeight(dp(54));
        e.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
''', "bulk adaptive edit")

s = one(s,
'''        b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));
''',
'''        b.setMinHeight(dp(52));
        b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
''', "bulk adaptive primary")

s = one(s,
'''        b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
''',
'''        b.setMinHeight(dp(48));
        b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
''', "bulk adaptive secondary")

s = one(s,
'''        private final Set<String> selected = new LinkedHashSet<>();
        private final Runnable changed;

        ContactSelectionAdapter(List<ContactRepository.Item> contacts, Runnable changed) {
            this.all = contacts == null ? new ArrayList<>() : new ArrayList<>(contacts);
            this.visible.addAll(this.all);
            this.changed = changed;
        }

        void filter(String query) {
            visible.clear();
            for (ContactRepository.Item item : all) if (item.matches(query)) visible.add(item);
            notifyDataSetChanged();
            changed.run();
        }
''',
'''        private final Set<String> selected = new LinkedHashSet<>();
        private final Set<String> recent;
        private final Set<String> blocked;
        private final Runnable changed;

        ContactSelectionAdapter(List<ContactRepository.Item> contacts, Set<String> recent, Set<String> blocked, Runnable changed) {
            this.all = contacts == null ? new ArrayList<>() : new ArrayList<>(contacts);
            this.recent = recent == null ? new LinkedHashSet<>() : recent;
            this.blocked = blocked == null ? new LinkedHashSet<>() : blocked;
            this.changed = changed;
        }

        void filter(String query, boolean mobileOnly, boolean excludeRecent) {
            visible.clear();
            for (ContactRepository.Item item : all) {
                if (blocked.contains(item.phone)) continue;
                if (mobileOnly && !item.mobile) continue;
                if (excludeRecent && recent.contains(item.phone)) continue;
                if (item.matches(query)) visible.add(item);
            }
            notifyDataSetChanged();
            changed.run();
        }
''', "adapter filter")

s = one(s,
'''            for (ContactRepository.Item item : all) if (selected.contains(item.phone)) result.add(item);
''',
'''            for (ContactRepository.Item item : all) {
                if (selected.contains(item.phone) && !blocked.contains(item.phone)) result.add(item);
            }
''', "selected blocked guard")

p.write_text(s)
