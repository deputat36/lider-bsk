from pathlib import Path

p=Path("android/build-src/sms-card-app/app/src/main/java/ru/etagi/borisoglebsk/smscard/BulkCampaignActivity.java")
s=p.read_text()
def change(old,new,label):
    global s
    if old not in s: raise RuntimeError("BulkCampaignActivity marker missing: "+label)
    s=s.replace(old,new,1)

change('import android.content.Intent;\n', 'import android.content.Intent;\nimport android.net.Uri;\nimport android.os.Build;\nimport android.view.WindowInsets;\n', 'imports')
change('    private ContactSelectionAdapter contactAdapter;\n',
'''    private ContactSelectionAdapter contactAdapter;
    private final Set<String> savedSelection = new LinkedHashSet<>();
    private String savedSearch = "";
    private boolean savedMobileOnly = true;
    private boolean savedExcludeRecent = true;
    private boolean editingDraft = false;
    private int contactLoadGeneration = 0;
''','fields')
change('''            choosingContacts = savedInstanceState.getBoolean("choosing_contacts", false);
''',
'''            choosingContacts = savedInstanceState.getBoolean("choosing_contacts", false);
            editingDraft = savedInstanceState.getBoolean("editing_draft", false);
            savedSearch = savedInstanceState.getString("recipient_search", "");
            savedMobileOnly = savedInstanceState.getBoolean("mobile_only", true);
            savedExcludeRecent = savedInstanceState.getBoolean("exclude_recent", true);
            savedSelection.addAll(savedInstanceState.getStringArrayList("selected_numbers") == null
                    ? new ArrayList<>() : savedInstanceState.getStringArrayList("selected_numbers"));
''','restore state')
change('''        } else if (choosingContacts && !draftRendered.isEmpty()) {
            showContactSelection();
        } else {
            showDashboard();
        }
''',
'''        } else if (choosingContacts && !draftRendered.isEmpty()) {
            showContactSelection();
        } else if (editingDraft && !draftSource.isEmpty()) {
            showMessageSetup();
        } else {
            showDashboard();
        }
''', 'restore page')
change('''        outState.putBoolean("choosing_contacts", choosingContacts);
''',
'''        outState.putBoolean("choosing_contacts", choosingContacts);
        outState.putBoolean("editing_draft", editingDraft);
        outState.putString("recipient_search", savedSearch);
        outState.putBoolean("mobile_only", savedMobileOnly);
        outState.putBoolean("exclude_recent", savedExcludeRecent);
        if (contactAdapter != null) {
            savedSelection.clear();
            savedSelection.addAll(contactAdapter.selectedNumbers());
        }
        outState.putStringArrayList("selected_numbers", new ArrayList<>(savedSelection));
''','save state')
change('''    private void showDashboard() {
        choosingContacts = false;
''',
'''    private void showDashboard() {
        choosingContacts = false;
        editingDraft = false;
        contactLoadGeneration++;
''', 'dashboard status')
change('''    private void showMessageSetup() {
        choosingContacts = false;
''',
'''    private void showMessageSetup() {
        choosingContacts = false;
        editingDraft = true;
        contactLoadGeneration++;
''','editor status')
change('''            if (draftRendered.trim().isEmpty()) {
                Toast.makeText(this, "Текст рассылки пустой", Toast.LENGTH_LONG).show();
                return;
            }
''',
'''            if (draftRendered.trim().isEmpty() || SmsTemplates.containsUnknownVariables(draftRendered)) {
                Toast.makeText(this, "Текст пустой или содержит неизвестные переменные. Проверьте шаблон.", Toast.LENGTH_LONG).show();
                return;
            }
''','validate campaign text')
change('''    private void showContactSelection() {
        choosingContacts = true;
''',
'''    private void showContactSelection() {
        choosingContacts = true;
        editingDraft = false;
        final int loadGeneration = ++contactLoadGeneration;
''','selection generation')
change('''        EditText search = edit("Поиск по имени или номеру", InputType.TYPE_CLASS_TEXT);
        controls.addView(search, topMargin(10));
''',
'''        EditText search = edit("Поиск по имени или номеру", InputType.TYPE_CLASS_TEXT);
        search.setText(savedSearch);
        controls.addView(search, topMargin(10));
''','restore query')
change('''        onlyMobile.setChecked(true);
''', '''        onlyMobile.setChecked(savedMobileOnly);
''','restore mobile filter')
change('''        excludeRecent.setChecked(recentDays > 0);
''', '''        excludeRecent.setChecked(recentDays > 0 && savedExcludeRecent);
''','restore recent filter')
change('''        new Thread(() -> {
            List<ContactRepository.Item> contacts = ContactRepository.load(this);
            runOnUiThread(() -> {
''',
'''        new Thread(() -> {
            List<ContactRepository.Item> contacts = ContactRepository.load(this);
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed() || loadGeneration != contactLoadGeneration) return;
''','async task lifecycle')
change('''                contactAdapter = new ContactSelectionAdapter(contacts, recent, blocked, () -> {
''',
'''                contactAdapter = new ContactSelectionAdapter(contacts, recent, blocked, savedSelection, () -> {
''','initial selection')
change('''        Runnable applyFilters = () -> {
            if (contactAdapter != null) {
                contactAdapter.filter(search.getText().toString(), onlyMobile.isChecked(), excludeRecent.isChecked());
            }
        };
''',
'''        Runnable applyFilters = () -> {
            savedSearch = search.getText().toString();
            savedMobileOnly = onlyMobile.isChecked();
            savedExcludeRecent = excludeRecent.isChecked();
            if (contactAdapter != null) {
                contactAdapter.filter(savedSearch, savedMobileOnly, savedExcludeRecent);
            }
        };
''','filter state')
change('''            List<ContactRepository.Item> selected = contactAdapter.selectedItems();
            if (selected.isEmpty()) {
''',
'''            // Revalidate the selection at launch, even if filter settings changed after
            // selecting numbers or a number entered the stop-list in the meantime.
            Set<String> blockedNow = RecipientPolicyStore.blacklistedNumbers(this);
            int daysNow = AppPrefs.repeatDays(this);
            Set<String> recentNow = (excludeRecent.isChecked() && daysNow > 0)
                    ? RecipientPolicyStore.preparedSince(this,
                            System.currentTimeMillis() - TimeUnit.DAYS.toMillis(daysNow))
                    : new LinkedHashSet<>();
            List<ContactRepository.Item> selected = new ArrayList<>();
            for (ContactRepository.Item item : contactAdapter.selectedItems()) {
                if (blockedNow.contains(item.phone)) continue;
                if (onlyMobile.isChecked() && !item.mobile) continue;
                if (excludeRecent.isChecked() && recentNow.contains(item.phone)) continue;
                if (!PhoneNormalizer.usable(item.phone)) continue;
                selected.add(item);
            }
            if (selected.size() > 1000) {
                Toast.makeText(this, "Для надёжности одна очередь ограничена 1000 адресатами.", Toast.LENGTH_LONG).show();
                return;
            }
            if (selected.isEmpty()) {
''','revalidate launch')
change('''                    .setMessage("Получателей: " + selected.size() + "\n\nПриложение будет открывать SMS по одному. Отправку каждого сообщения вы подтверждаете в стандартном приложении сообщений.")
''',
'''                    .setMessage("Получателей: " + selected.size()
                            + "\n\nПроверьте согласие адресатов, если рассылка рекламная."
                            + "\n\nКаждое SMS открывается отдельно и подтверждается в стандартном приложении сообщений.")
''','consent warning')
change('''    private void showQueue() {
        choosingContacts = false;
''',
'''    private void showQueue() {
        choosingContacts = false;
        editingDraft = false;
        contactLoadGeneration++;
''','queue lifecycle')
change('''        Intent intent = new Intent(this, SmsComposeActivity.class)
                .putExtra("number", recipient.phone)
                .putExtra("call_type", "bulk")
                .putExtra("body_override", campaign.message)
                .putExtra("history_template", campaign.title)
                .putExtra("skip_history", true);
        startActivity(intent);
''',
'''        if (!PhoneNormalizer.usable(recipient.phone)
                || campaign.message.trim().isEmpty()
                || SmsTemplates.containsUnknownVariables(campaign.message)) {
            recipient.status = oldStatus;
            BulkCampaignStore.saveActive(this, campaign);
            Toast.makeText(this, "Проверьте номер или текст SMS перед отправкой", Toast.LENGTH_LONG).show();
            return;
        }
        // Launch the stock SMS composer directly so the queue is not marked opened
        // when a missing or blocked SMS app rejects the intent.
        Intent sms = new Intent(Intent.ACTION_SENDTO);
        sms.setData(Uri.parse("smsto:" + Uri.encode(recipient.phone)));
        sms.putExtra("sms_body", campaign.message);
        try {
            startActivity(sms);
        } catch (android.content.ActivityNotFoundException | SecurityException ex) {
            recipient.status = oldStatus;
            if (!BulkCampaignStore.saveActive(this, campaign)) {
                Toast.makeText(this, "Ошибка SMS и не удалось восстановить очередь.", Toast.LENGTH_LONG).show();
            } else {
                Toast.makeText(this, "Не удалось открыть приложение сообщений.", Toast.LENGTH_LONG).show();
            }
        }
''','bulk sms direct launch')
change('''        draftTemplate = SmsTemplates.UNIVERSAL;
        choosingContacts = false;
        contactAdapter = null;
''',
'''        draftTemplate = SmsTemplates.UNIVERSAL;
        choosingContacts = false;
        editingDraft = false;
        contactAdapter = null;
        savedSelection.clear();
        savedSearch = "";
        savedMobileOnly = true;
        savedExcludeRecent = true;
''','draft clear')
change('''        root.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout header''',
'''        root.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            root.requestApplyInsets();
        }

        LinearLayout header''','insets')
change('''        private final Set<String> selected = new LinkedHashSet<>();
''',
'''        private final Set<String> selected = new LinkedHashSet<>();
        private boolean mobileOnly = true;
        private boolean excludeRecent = true;
''','adapter filter memory')
change('''        ContactSelectionAdapter(List<ContactRepository.Item> contacts, Set<String> recent, Set<String> blocked, Runnable changed) {
''',
'''        ContactSelectionAdapter(List<ContactRepository.Item> contacts, Set<String> recent, Set<String> blocked, Set<String> previousSelection, Runnable changed) {
''','adapter signature')
change('''            this.changed = changed;
        }

        void filter(String query, boolean mobileOnly, boolean excludeRecent) {
''',
'''            this.changed = changed;
            if (previousSelection != null) selected.addAll(previousSelection);
        }

        void filter(String query, boolean mobileOnly, boolean excludeRecent) {
            this.mobileOnly = mobileOnly;
            this.excludeRecent = excludeRecent;
            // A stricter filter revokes already selected ineligible numbers;
            // changing only the search query preserves cross-search selections.
            for (ContactRepository.Item item : all) {
                if (blocked.contains(item.phone)
                        || (mobileOnly && !item.mobile)
                        || (excludeRecent && recent.contains(item.phone))) {
                    selected.remove(item.phone);
                }
            }
''','adapter filter prune')
change('''        int selectedCount() { return selected.size(); }
''',
'''        Set<String> selectedNumbers() { return new LinkedHashSet<>(selected); }
        int selectedCount() { return selected.size(); }
''','adapter selected snapshot')
change('''                if (selected.contains(item.phone) && !blocked.contains(item.phone)) result.add(item);
''',
'''                if (selected.contains(item.phone) && !blocked.contains(item.phone)
                        && (!mobileOnly || item.mobile)
                        && (!excludeRecent || !recent.contains(item.phone))) result.add(item);
''','eligible selected items')

p.write_text(s)
print("Bulk v0.5.2 patch applied.")
