from pathlib import Path
import re

root = Path('android/build-src/sms-card-app')

def one(s, old, new, label):
    if old not in s:
        raise RuntimeError(f'{label}: marker not found')
    return s.replace(old, new, 1)

p = root / 'app/src/main/java/ru/etagi/borisoglebsk/smscard/MainActivity.java'
s = p.read_text()
s = one(s,
'''    private Button tabHistory;
    private Button tabSettings;''',
'''    private Button tabHistory;
    private Button tabBulk;
    private Button tabSettings;''', 'tab field')
s = one(s,
'''        tabSend = tabButton("Отправить");
        tabHistory = tabButton("История");
        tabSettings = tabButton("Настройки");''',
'''        tabSend = tabButton("Отправить");
        tabHistory = tabButton("История");
        tabBulk = tabButton("Рассылки");
        tabSettings = tabButton("Настройки");''', 'tab create')
s = one(s,
'''        tabs.addView(tabSend, tabLp);
        tabs.addView(tabHistory, tabLp);
        tabs.addView(tabSettings, tabLp);''',
'''        tabs.addView(tabSend, tabLp);
        tabs.addView(tabHistory, tabLp);
        tabs.addView(tabBulk, tabLp);
        tabs.addView(tabSettings, tabLp);''', 'tab views')
s = one(s,
'''        tabSend.setOnClickListener(v -> showHome());
        tabHistory.setOnClickListener(v -> showHistory());
        tabSettings.setOnClickListener(v -> showSettings());''',
'''        tabSend.setOnClickListener(v -> showHome());
        tabHistory.setOnClickListener(v -> showHistory());
        tabBulk.setOnClickListener(v -> startActivity(new Intent(this, BulkCampaignActivity.class)));
        tabSettings.setOnClickListener(v -> showSettings());''', 'tab click')
s = one(s,
'''        Button[] all = {tabSend, tabHistory, tabSettings};''',
'''        Button[] all = {tabSend, tabHistory, tabBulk, tabSettings};''', 'select tabs')
s = one(s,
'''        if (CallSessionStore.TYPE_MISSED.equals(type)) return "Пропущенный";
        return "Ручная отправка";''',
'''        if (CallSessionStore.TYPE_MISSED.equals(type)) return "Пропущенный";
        if ("bulk".equals(type)) return "Рассылка";
        return "Ручная отправка";''', 'bulk history label')
p.write_text(s)

p = root / 'app/src/main/java/ru/etagi/borisoglebsk/smscard/SmsComposeActivity.java'
s = p.read_text()
s = one(s,
'''        boolean skipHistory = getIntent().getBooleanExtra("skip_history", false);''',
'''        boolean skipHistory = getIntent().getBooleanExtra("skip_history", false);
        String bodyOverride = getIntent().getStringExtra("body_override");
        String historyTemplate = getIntent().getStringExtra("history_template");''', 'compose extras')
s = one(s,
'''        String body = SmsTemplates.build(this, template, clientName);
        if (!skipHistory) {
            HistoryStore.add(this, number, callType == null ? "manual" : callType, SmsTemplates.NAMES[template]);
        }''',
'''        String body = bodyOverride != null ? bodyOverride : SmsTemplates.build(this, template, clientName);
        if (!skipHistory) {
            String templateName = historyTemplate != null && !historyTemplate.trim().isEmpty()
                    ? historyTemplate
                    : SmsTemplates.NAMES[template];
            HistoryStore.add(this, number, callType == null ? "manual" : callType, templateName);
        }''', 'compose override')
p.write_text(s)

p = root / 'app/src/main/AndroidManifest.xml'
s = p.read_text()
s = one(s,
'''        <activity
            android:name=".SmsComposeActivity"''',
'''        <activity
            android:name=".BulkCampaignActivity"
            android:exported="false" />

        <activity
            android:name=".SmsComposeActivity"''', 'manifest bulk activity')
p.write_text(s)

p = root / 'app/build.gradle.kts'
s = p.read_text()
s = re.sub(r'versionCode\s*=\s*\d+', 'versionCode = 6', s)
s = re.sub(r'versionName\s*=\s*"[^"]+"', 'versionName = "0.5.0"', s)
p.write_text(s)
