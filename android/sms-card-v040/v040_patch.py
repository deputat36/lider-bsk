from pathlib import Path
import re

root = Path("android/build-src/sms-card-app")

def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"{label}: marker not found")
    return text.replace(old, new, 1)

p = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard/MainActivity.java"
s = p.read_text()

s = replace_once(s, "import android.app.Activity;\n",
                 "import android.app.Activity;\nimport android.app.AlertDialog;\nimport android.app.NotificationManager;\n",
                 "imports activity")
s = replace_once(s, "import android.content.Intent;\n",
                 "import android.content.Intent;\nimport android.net.Uri;\n",
                 "imports uri")
s = replace_once(s, "import java.text.SimpleDateFormat;\n",
                 "import java.io.BufferedReader;\nimport java.io.InputStream;\nimport java.io.InputStreamReader;\nimport java.io.OutputStream;\nimport java.nio.charset.StandardCharsets;\nimport java.text.SimpleDateFormat;\n",
                 "imports io")
s = replace_once(s, "import java.util.Locale;\n",
                 "import java.util.Locale;\nimport java.util.concurrent.TimeUnit;\n",
                 "imports timeunit")

s = replace_once(s,
                 "    private static final int REQUEST_ROLE = 201;\n",
                 "    private static final int REQUEST_ROLE = 201;\n"
                 "    private static final int REQUEST_EXPORT_CONFIG = 202;\n"
                 "    private static final int REQUEST_IMPORT_CONFIG = 203;\n",
                 "request constants")

s = replace_once(s,
'''            int length = message.length();
            int segments = length <= 70 ? 1 : (int) Math.ceil(length / 67.0);
            smsCount.setText(length + " символов • примерно " + segments + " SMS");
''',
'''            SmsLength.Info info = SmsLength.calculate(message);
            smsCount.setText(info.label());
''',
"home sms length")

s = replace_once(s,
'''            Intent intent = new Intent(this, SmsComposeActivity.class)
                    .putExtra("number", number)
                    .putExtra("call_type", "manual")
                    .putExtra("template", spinner.getSelectedItemPosition())
                    .putExtra("client_name", client.getText().toString());
            startActivity(intent);
''',
'''            openSmsWithRepeatCheck(
                    number,
                    spinner.getSelectedItemPosition(),
                    client.getText().toString()
            );
''',
"manual repeat check")

s = replace_once(s,
'''            int length = rendered.length();
            int segments = length == 0 ? 0 : (length <= 70 ? 1 : (int) Math.ceil(length / 67.0));
            templateSmsCount.setText(length + " символов • примерно " + segments + " SMS");
''',
'''            SmsLength.Info info = SmsLength.calculate(rendered);
            templateSmsCount.setText(info.label());
''',
"template sms length")

s = replace_once(s,
'''        box.addView(resetTemplate, topMargin(8));

        box.addView(small("{client_name} используется только если имя введено вручную перед отправкой. Название контакта из телефонной книги в SMS автоматически не подставляется."), topMargin(10));
''',
'''        box.addView(resetTemplate, topMargin(8));

        Button testTemplate = secondaryButton("Тест шаблона на мой номер");
        testTemplate.setOnClickListener(v -> {
            if (AppPrefs.phone(this).trim().isEmpty()) {
                Toast.makeText(this, "Сначала сохраните свой телефон в профиле", Toast.LENGTH_LONG).show();
                return;
            }
            int index = templateEditSelector.getSelectedItemPosition();
            if (index < 0) return;
            AppPrefs.saveSmsTemplate(this, index, templateEditor.getText().toString());
            Intent intent = new Intent(this, SmsComposeActivity.class)
                    .putExtra("number", AppPrefs.phone(this))
                    .putExtra("call_type", "test")
                    .putExtra("template", index)
                    .putExtra("client_name", "")
                    .putExtra("skip_history", true);
            startActivity(intent);
        });
        box.addView(testTemplate, topMargin(8));

        box.addView(small("{client_name} используется только если имя введено вручную перед отправкой. Название контакта из телефонной книги в SMS автоматически не подставляется."), topMargin(10));
''',
"test template")

s = replace_once(s,
'''        String[] repeatOptions = {"7 дней", "30 дней", "90 дней"};
        repeat.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, repeatOptions));
        int days = AppPrefs.repeatDays(this);
        repeat.setSelection(days == 7 ? 0 : (days == 90 ? 2 : 1));
''',
'''        String[] repeatOptions = {"Не ограничивать", "1 день", "7 дней", "30 дней", "90 дней"};
        repeat.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, repeatOptions));
        int days = AppPrefs.repeatDays(this);
        int repeatPosition = days == 0 ? 0 : (days == 1 ? 1 : (days == 7 ? 2 : (days == 90 ? 4 : 3)));
        repeat.setSelection(repeatPosition);
''',
"repeat options")

s = replace_once(s,
'''            int selectedDays = repeat.getSelectedItemPosition() == 0 ? 7 : (repeat.getSelectedItemPosition() == 2 ? 90 : 30);
''',
'''            int pos = repeat.getSelectedItemPosition();
            int selectedDays = pos == 0 ? 0 : (pos == 1 ? 1 : (pos == 2 ? 7 : (pos == 4 ? 90 : 30)));
''',
"repeat save")

s = replace_once(s,
'''        TextView permissionNote = small("Для функции после звонка Android запросит доступ к состоянию телефона, контактам и уведомлениям, а затем предложит назначить приложение для скрининга звонков. Контакты нужны системе, чтобы функция работала и для сохранённых номеров.");
''',
'''        box.addView(sectionTitle("Проверка работы на этом телефоне"), topMargin(26));
        NotificationHelper.ensureChannel(this);
        LinearLayout diagnostics = card();
        diagnostics.addView(label(DeviceDiagnostics.deviceLabel()));
        diagnostics.addView(diagnosticLine(DeviceDiagnostics.callRoleHeld(this), "Скрининг звонков", DeviceDiagnostics.callRoleHeld(this) ? "роль включена" : "роль не предоставлена"), topMargin(8));
        diagnostics.addView(diagnosticLine(DeviceDiagnostics.phonePermission(this), "Телефон", DeviceDiagnostics.phonePermission(this) ? "разрешение есть" : "нужно разрешение"), topMargin(5));
        diagnostics.addView(diagnosticLine(DeviceDiagnostics.contactsPermission(this), "Контакты", DeviceDiagnostics.contactsPermission(this) ? "разрешение есть" : "нужно для сохранённых номеров"), topMargin(5));
        diagnostics.addView(diagnosticLine(DeviceDiagnostics.notificationsPermission(this), "Уведомления", DeviceDiagnostics.notificationsPermission(this) ? "разрешены" : "выключены системой или пользователем"), topMargin(5));
        boolean popupChannelOk = DeviceDiagnostics.notificationImportance(this) >= NotificationManager.IMPORTANCE_HIGH;
        diagnostics.addView(diagnosticLine(popupChannelOk, "Всплывающий канал", DeviceDiagnostics.notificationImportanceLabel(this)), topMargin(5));
        diagnostics.addView(diagnosticLine(DeviceDiagnostics.batteryUnrestricted(this), "Фоновая работа", DeviceDiagnostics.batteryUnrestricted(this) ? "без системной оптимизации" : "оптимизация батареи включена"), topMargin(5));
        diagnostics.addView(small(DeviceDiagnostics.manufacturerAdvice()), topMargin(10));
        box.addView(diagnostics);

        Button testPopup = primaryButton("Показать тестовое уведомление");
        testPopup.setOnClickListener(v -> {
            if (NotificationHelper.showTest(this)) {
                Toast.makeText(this, "Проверьте: баннер должен появиться поверх экрана", Toast.LENGTH_LONG).show();
            } else {
                Toast.makeText(this, "Уведомления сейчас запрещены. Откройте их настройки.", Toast.LENGTH_LONG).show();
                DeviceDiagnostics.openNotificationSettings(this);
            }
        });
        box.addView(testPopup, topMargin(12));

        Button notificationSettings = secondaryButton("Настройки всплывающих уведомлений");
        notificationSettings.setOnClickListener(v -> DeviceDiagnostics.openNotificationSettings(this));
        box.addView(notificationSettings, topMargin(8));

        Button batterySettings = secondaryButton("Настройки фоновой работы / батареи");
        batterySettings.setOnClickListener(v -> DeviceDiagnostics.openBatterySettings(this));
        box.addView(batterySettings, topMargin(8));

        box.addView(sectionTitle("Перенос настроек"), topMargin(26));
        box.addView(small("Экспорт переносит профиль, настройки автоматизации и все SMS-шаблоны. История номеров в файл не включается."));

        Button exportConfig = secondaryButton("Экспортировать настройки");
        exportConfig.setOnClickListener(v -> startConfigExport());
        box.addView(exportConfig, topMargin(10));

        Button importConfig = secondaryButton("Импортировать настройки");
        importConfig.setOnClickListener(v -> startConfigImport());
        box.addView(importConfig, topMargin(8));

        TextView permissionNote = small("Для функции после звонка Android запросит доступ к состоянию телефона, контактам и уведомлениям, а затем предложит назначить приложение для скрининга звонков. Контакты нужны системе, чтобы функция работала и для сохранённых номеров.");
''',
"diagnostics block")

s = replace_once(s,
'''        appSettings.setOnClickListener(v -> {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(android.net.Uri.parse("package:" + getPackageName()));
            startActivity(i);
        });
''',
'''        appSettings.setOnClickListener(v -> DeviceDiagnostics.openAppSettings(this));
''',
"app settings")

s = replace_once(s,
'''        if (requestCode == REQUEST_PERMISSIONS) {
            if (hasPhonePermission()) {
                requestCallScreeningRole();
            } else {
                Toast.makeText(this, "Без доступа к состоянию телефона нельзя определить завершение звонка", Toast.LENGTH_LONG).show();
            }
        }
''',
'''        if (requestCode == REQUEST_PERMISSIONS) {
            if (hasPhonePermission() && hasContactsPermission() && hasNotificationPermission()) {
                requestCallScreeningRole();
            } else {
                StringBuilder missing = new StringBuilder("Не хватает разрешений: ");
                if (!hasPhonePermission()) missing.append("телефон, ");
                if (!hasContactsPermission()) missing.append("контакты, ");
                if (!hasNotificationPermission()) missing.append("уведомления, ");
                String text = missing.toString().replaceAll(", $", "");
                Toast.makeText(this, text + ". Их можно включить в системных настройках приложения.", Toast.LENGTH_LONG).show();
                showSettings();
            }
        }
''',
"permission result")

s = replace_once(s,
'''    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_ROLE) {
            Toast.makeText(this,
                    resultCode == RESULT_OK ? "Функция после звонка включена" : "Роль не была предоставлена",
                    Toast.LENGTH_LONG).show();
            showSettings();
        }
    }
''',
'''    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_ROLE) {
            Toast.makeText(this,
                    resultCode == RESULT_OK ? "Функция после звонка включена" : "Роль не была предоставлена",
                    Toast.LENGTH_LONG).show();
            showSettings();
            return;
        }
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        if (requestCode == REQUEST_EXPORT_CONFIG) {
            exportConfigTo(data.getData());
        } else if (requestCode == REQUEST_IMPORT_CONFIG) {
            importConfigFrom(data.getData());
        }
    }
''',
"activity result")

s = replace_once(s,
'''    private boolean isCallRoleHeld() {
        RoleManager rm = getSystemService(RoleManager.class);
        return rm != null && rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) && rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING);
    }
''',
'''    private boolean isCallRoleHeld() {
        return DeviceDiagnostics.callRoleHeld(this);
    }
''',
"role helper")

s = replace_once(s,
'''    private void selectTab(Button selected) {
''',
'''    private void openSmsWithRepeatCheck(String number, int template, String clientName) {
        int days = AppPrefs.repeatDays(this);
        long last = HistoryStore.lastPreparedFor(this, number);
        boolean recent = days > 0 && last > 0
                && last >= System.currentTimeMillis() - TimeUnit.DAYS.toMillis(days);

        if (!recent) {
            launchSms(number, template, clientName);
            return;
        }

        String when = new SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(new Date(last));
        new AlertDialog.Builder(this)
                .setTitle("Визитка уже подготавливалась")
                .setMessage("Для этого номера SMS-визитка уже подготавливалась " + when + ". Открыть её ещё раз?")
                .setPositiveButton("Всё равно открыть SMS", (dialog, which) -> launchSms(number, template, clientName))
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void launchSms(String number, int template, String clientName) {
        Intent intent = new Intent(this, SmsComposeActivity.class)
                .putExtra("number", number)
                .putExtra("call_type", "manual")
                .putExtra("template", template)
                .putExtra("client_name", clientName);
        startActivity(intent);
    }

    private TextView diagnosticLine(boolean ok, String name, String detail) {
        TextView t = body((ok ? "✓ " : "⚠ ") + name + ": " + detail);
        t.setTextColor(ok ? Color.rgb(25, 118, 65) : Color.rgb(183, 92, 0));
        return t;
    }

    private void startConfigExport() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/json")
                .putExtra(Intent.EXTRA_TITLE, "etagi-sms-vizitka-settings.json");
        try {
            startActivityForResult(intent, REQUEST_EXPORT_CONFIG);
        } catch (Exception e) {
            Toast.makeText(this, "На устройстве не найден системный выбор файлов", Toast.LENGTH_LONG).show();
        }
    }

    private void startConfigImport() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/json");
        try {
            startActivityForResult(intent, REQUEST_IMPORT_CONFIG);
        } catch (Exception e) {
            Toast.makeText(this, "На устройстве не найден системный выбор файлов", Toast.LENGTH_LONG).show();
        }
    }

    private void exportConfigTo(Uri uri) {
        try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IllegalStateException("Не удалось открыть файл");
            output.write(ConfigBackup.exportJson(this).getBytes(StandardCharsets.UTF_8));
            output.flush();
            Toast.makeText(this, "Настройки экспортированы", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Не удалось экспортировать настройки: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void importConfigFrom(Uri uri) {
        try (InputStream input = getContentResolver().openInputStream(uri);
             BufferedReader reader = input == null ? null : new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            if (reader == null) throw new IllegalStateException("Не удалось открыть файл");
            StringBuilder json = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) json.append(line).append(System.lineSeparator());
            ConfigBackup.importJson(this, json.toString());
            Toast.makeText(this, "Настройки импортированы", Toast.LENGTH_SHORT).show();
            showSettings();
        } catch (Exception e) {
            Toast.makeText(this, "Не удалось импортировать настройки: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void selectTab(Button selected) {
''',
"utility methods")

p.write_text(s)

# Test template should not pollute history.
p = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard/SmsComposeActivity.java"
s = p.read_text()
s = replace_once(s,
'''        String clientName = getIntent().getStringExtra("client_name");
''',
'''        String clientName = getIntent().getStringExtra("client_name");
        boolean skipHistory = getIntent().getBooleanExtra("skip_history", false);
''',
"compose skip history flag")
s = replace_once(s,
'''        HistoryStore.add(this, number, callType == null ? "manual" : callType, SmsTemplates.NAMES[template]);
''',
'''        if (!skipHistory) {
            HistoryStore.add(this, number, callType == null ? "manual" : callType, SmsTemplates.NAMES[template]);
        }
''',
"compose skip history")
p.write_text(s)

# Repeat=0 means no suppression.
p = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard/CallStateReceiver.java"
s = p.read_text()
s = replace_once(s,
'''        long days = AppPrefs.repeatDays(c);
        long threshold = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(days);
        return last >= threshold;
''',
'''        long days = AppPrefs.repeatDays(c);
        if (days <= 0) return false;
        long threshold = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(days);
        return last >= threshold;
''',
"repeat zero")
p.write_text(s)

# Version metadata.
p = root / "app/build.gradle.kts"
s = p.read_text()
s = re.sub(r'versionCode\s*=\s*\d+', 'versionCode = 5', s)
s = re.sub(r'versionName\s*=\s*"[^"]+"', 'versionName = "0.4.0"', s)
p.write_text(s)
