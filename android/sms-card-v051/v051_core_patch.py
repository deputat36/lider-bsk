from pathlib import Path
import re

root = Path("android/build-src/sms-card-app")

def one(s, old, new, label):
    if old not in s:
        raise RuntimeError(f"{label}: marker not found")
    return s.replace(old, new, 1)

p = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard/HistoryStore.java"
s = p.read_text()
s = one(s,
'''        p(c).edit().putString(KEY, next.toString()).apply();
''',
'''        p(c).edit().putString(KEY, next.toString()).apply();
        RecipientPolicyStore.recordPrepared(c, number);
''', "history record ledger")
s = one(s,
'''    public static synchronized long lastPreparedFor(Context c, String number) {
        String n = normalize(number);
        for (Item item : list(c)) {
            if (normalize(item.number).equals(n)) return item.time;
        }
        return 0L;
    }
''',
'''    public static synchronized long lastPreparedFor(Context c, String number) {
        long indexed = RecipientPolicyStore.lastPrepared(c, number);
        if (indexed > 0) return indexed;

        String n = PhoneNormalizer.normalize(number);
        for (Item item : list(c)) {
            if (PhoneNormalizer.normalize(item.number).equals(n)) {
                RecipientPolicyStore.recordPreparedAt(c, number, item.time);
                return item.time;
            }
        }
        return 0L;
    }
''', "history read ledger")
s = one(s,
'''    public static void clear(Context c) {
        p(c).edit().remove(KEY).apply();
    }
''',
'''    public static void clear(Context c) {
        p(c).edit().remove(KEY).apply();
        RecipientPolicyStore.clearPrepared(c);
    }
''', "history clear ledger")
s = re.sub(r'\n    private static String normalize\(String number\) \{.*?\n    \}\n\n    public static final class Item',
           '\n    public static final class Item', s, flags=re.S)
p.write_text(s)

p = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard/SmsComposeActivity.java"
s = p.read_text()
s = one(s,
'''        String historyTemplate = getIntent().getStringExtra("history_template");
''',
'''        String historyTemplate = getIntent().getStringExtra("history_template");
        int notificationId = getIntent().getIntExtra("notification_id", -1);
''', "notification id extra")
s = one(s, '        NotificationHelper.dismiss(this);\n',
        '        NotificationHelper.dismiss(this, notificationId);\n',
        "dismiss selected notification")
p.write_text(s)

p = root / "app/src/main/AndroidManifest.xml"
s = p.read_text()
s = one(s,
'''        android:allowBackup="true"
        android:icon="@drawable/ic_app"''',
'''        android:allowBackup="false"
        android:fullBackupContent="@xml/backup_rules"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:icon="@drawable/ic_app"''', "manifest backup rules")
p.write_text(s)

p = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard/MainActivity.java"
s = p.read_text()
s = one(s,
'''    @Override
    protected void onResume() {
        super.onResume();
        if (content != null && tabSettings != null && tabSettings.isSelected()) {
            showSettings();
        }
    }
''',
'''    @Override
    protected void onResume() {
        super.onResume();
        // Не перестраиваем экран автоматически: это сохраняет несохранённый текст
        // профиля/шаблонов после возврата из системных настроек.
    }
''', "settings resume")
s = one(s,
'''        LinearLayout.LayoutParams tabLp = new LinearLayout.LayoutParams(0, dp(44), 1f);
''',
'''        LinearLayout.LayoutParams tabLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
''', "adaptive tabs")
s = one(s,
'''        diagnostics.addView(diagnosticLine(DeviceDiagnostics.batteryUnrestricted(this), "Фоновая работа", DeviceDiagnostics.batteryUnrestricted(this) ? "без системной оптимизации" : "оптимизация батареи включена"), topMargin(5));
        diagnostics.addView(small(DeviceDiagnostics.manufacturerAdvice()), topMargin(10));
''',
'''        boolean backgroundOk = !DeviceDiagnostics.backgroundRestricted(this);
        diagnostics.addView(diagnosticLine(backgroundOk, "Фоновая работа", backgroundOk ? "жёстких ограничений Android нет" : "Android ограничил фоновую работу"), topMargin(5));
        diagnostics.addView(small(DeviceDiagnostics.batteryOptimizationLabel(this)), topMargin(6));
        diagnostics.addView(small(DeviceDiagnostics.manufacturerAdvice()), topMargin(10));
''', "background diagnostics")
s = one(s,
'''        box.addView(testPopup, topMargin(12));

        Button notificationSettings = secondaryButton("Настройки всплывающих уведомлений");
''',
'''        box.addView(testPopup, topMargin(12));

        Button refreshDiagnostics = secondaryButton("Обновить диагностику");
        refreshDiagnostics.setOnClickListener(v -> showSettings());
        box.addView(refreshDiagnostics, topMargin(8));

        Button notificationSettings = secondaryButton("Настройки всплывающих уведомлений");
''', "refresh diagnostics")
s = one(s,
'''                Toast.makeText(this, text + ". Их можно включить в системных настройках приложения.", Toast.LENGTH_LONG).show();
                showSettings();
''',
'''                Toast.makeText(this, text + ". Их можно включить в системных настройках приложения.", Toast.LENGTH_LONG).show();
''', "permission result preserve draft")
s = one(s,
'''        if (rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
            Toast.makeText(this, "Функция после звонка уже включена", Toast.LENGTH_SHORT).show();
            showSettings();
            return;
        }
''',
'''        if (rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
            Toast.makeText(this, "Функция после звонка уже включена", Toast.LENGTH_SHORT).show();
            return;
        }
''', "role held preserve draft")
s = one(s,
'''            Toast.makeText(this,
                    resultCode == RESULT_OK ? "Функция после звонка включена" : "Роль не была предоставлена",
                    Toast.LENGTH_LONG).show();
            showSettings();
            return;
''',
'''            Toast.makeText(this,
                    resultCode == RESULT_OK ? "Функция после звонка включена" : "Роль не была предоставлена",
                    Toast.LENGTH_LONG).show();
            return;
''', "role result preserve draft")
s = one(s,
'''        e.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(54)
        ));
''',
'''        e.setMinHeight(dp(54));
        e.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));
''', "adaptive edit")
s = one(s,
'''        b.setTextSize(13);
        b.setAllCaps(false);
''',
'''        b.setTextSize(12);
        b.setAllCaps(false);
        b.setSingleLine(false);
        b.setMinHeight(dp(48));
''', "adaptive tab text")
s = one(s,
'''        b.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(52)
        ));
''',
'''        b.setMinHeight(dp(52));
        b.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));
''', "adaptive primary")
s = one(s,
'''        b.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(48)
        ));
''',
'''        b.setMinHeight(dp(48));
        b.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));
''', "adaptive secondary")
p.write_text(s)

p = root / "app/build.gradle.kts"
s = p.read_text()
s = re.sub(r'versionCode\s*=\s*\d+', 'versionCode = 7', s)
s = re.sub(r'versionName\s*=\s*"[^"]+"', 'versionName = "0.5.1"', s)
if "dependencies {" not in s:
    s += '\n\ndependencies {\n    testImplementation("junit:junit:4.13.2")\n}\n'
p.write_text(s)

p = root / "gradle.properties"
s = p.read_text().replace("android.useAndroidX=false\n", "")
p.write_text(s)
