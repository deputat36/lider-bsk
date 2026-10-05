from pathlib import Path
import re

root = Path("android/build-src/sms-card-app")

# Store fully editable templates in SharedPreferences.
p = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard/AppPrefs.java"
s = p.read_text()
if "public static String smsTemplate(" not in s:
    marker = '    public static int repeatDays(Context c) { return p(c).getInt("repeat_days", 30); }\n'
    addition = '''    public static String smsTemplate(Context c, int template) {
        return p(c).getString("sms_template_" + template, SmsTemplates.defaultTemplate(template));
    }

    public static void saveSmsTemplate(Context c, int template, String value) {
        p(c).edit().putString("sms_template_" + template, value == null ? "" : value).apply();
    }

    public static void resetSmsTemplate(Context c, int template) {
        p(c).edit().remove("sms_template_" + template).apply();
    }

'''
    if marker not in s:
        raise RuntimeError("AppPrefs insertion marker not found")
    s = s.replace(marker, marker + "\n" + addition, 1)
p.write_text(s)

# Add template editor UI to Settings.
p = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard/MainActivity.java"
s = p.read_text()

editor_marker = '        box.addView(sectionTitle("После звонка"), topMargin(26));\n'
if 'sectionTitle("Шаблоны SMS")' not in s:
    editor_block = '''        box.addView(sectionTitle("Шаблоны SMS"), topMargin(26));
        box.addView(small("Весь текст сообщения можно заменить. Приложение отправит только то, что находится в выбранном шаблоне. Необязательные переменные с пустыми значениями удаляются вместе со своей строкой."));

        TextView templateEditLabel = label("Редактируемый шаблон");
        box.addView(templateEditLabel, topMargin(12));

        Spinner templateEditSelector = new Spinner(this);
        templateEditSelector.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, SmsTemplates.NAMES));
        box.addView(templateEditSelector, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));

        EditText templateEditor = multiLineEdit("Введите любой текст SMS", 230);
        box.addView(templateEditor, topMargin(10));

        TextView variableLabel = label("Вставить переменную");
        box.addView(variableLabel, topMargin(12));
        Spinner variableSelector = new Spinner(this);
        variableSelector.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, SmsTemplates.VARIABLE_LABELS));
        box.addView(variableSelector, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));

        Button insertVariable = secondaryButton("Вставить выбранную переменную");
        insertVariable.setOnClickListener(v -> {
            int index = variableSelector.getSelectedItemPosition();
            if (index < 0 || index >= SmsTemplates.VARIABLE_TOKENS.length) return;
            String token = SmsTemplates.VARIABLE_TOKENS[index];
            int start = Math.max(0, templateEditor.getSelectionStart());
            templateEditor.getText().insert(start, token);
            templateEditor.requestFocus();
            templateEditor.setSelection(Math.min(start + token.length(), templateEditor.length()));
        });
        box.addView(insertVariable, topMargin(8));

        LinearLayout templatePreviewCard = card();
        templatePreviewCard.addView(label("Предпросмотр шаблона"));
        TextView templatePreviewText = body("");
        templatePreviewText.setTextColor(BLACK);
        templatePreviewText.setTextSize(15);
        TextView templateSmsCount = small("");
        templatePreviewCard.addView(templatePreviewText, topMargin(8));
        templatePreviewCard.addView(templateSmsCount, topMargin(8));
        box.addView(templatePreviewCard, topMargin(12));

        Runnable updateTemplatePreview = () -> {
            String rendered = SmsTemplates.render(this, templateEditor.getText().toString(), "");
            templatePreviewText.setText(rendered.isEmpty() ? "Сообщение пустое" : rendered);
            int length = rendered.length();
            int segments = length == 0 ? 0 : (length <= 70 ? 1 : (int) Math.ceil(length / 67.0));
            templateSmsCount.setText(length + " символов • примерно " + segments + " SMS");
        };

        Runnable loadSelectedTemplate = () -> {
            int index = templateEditSelector.getSelectedItemPosition();
            if (index < 0) return;
            String value = AppPrefs.smsTemplate(this, index);
            templateEditor.setText(value);
            templateEditor.setSelection(templateEditor.length());
            updateTemplatePreview.run();
        };

        templateEditSelector.setOnItemSelectedListener(new SimpleItemSelectedListener(loadSelectedTemplate));
        templateEditor.addTextChangedListener(new SimpleTextWatcher(updateTemplatePreview));
        loadSelectedTemplate.run();

        Button saveTemplate = primaryButton("Сохранить шаблон");
        saveTemplate.setOnClickListener(v -> {
            int index = templateEditSelector.getSelectedItemPosition();
            if (index < 0) return;
            AppPrefs.saveSmsTemplate(this, index, templateEditor.getText().toString());
            Toast.makeText(this, "Шаблон сохранён", Toast.LENGTH_SHORT).show();
            updateTemplatePreview.run();
        });
        box.addView(saveTemplate, topMargin(12));

        Button resetTemplate = secondaryButton("Вернуть стандартный текст");
        resetTemplate.setOnClickListener(v -> {
            int index = templateEditSelector.getSelectedItemPosition();
            if (index < 0) return;
            AppPrefs.resetSmsTemplate(this, index);
            loadSelectedTemplate.run();
            Toast.makeText(this, "Стандартный шаблон восстановлен", Toast.LENGTH_SHORT).show();
        });
        box.addView(resetTemplate, topMargin(8));

        box.addView(small("{client_name} используется только если имя введено вручную перед отправкой. Название контакта из телефонной книги в SMS автоматически не подставляется."), topMargin(10));

'''
    if editor_marker not in s:
        raise RuntimeError("MainActivity editor marker not found")
    s = s.replace(editor_marker, editor_block + editor_marker, 1)

helper_marker = '    private Button tabButton(String text) {\n'
if 'private EditText multiLineEdit(' not in s:
    helper = '''    private EditText multiLineEdit(String hint, int heightDp) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextSize(15);
        e.setTextColor(BLACK);
        e.setHintTextColor(Color.rgb(145, 145, 145));
        e.setSingleLine(false);
        e.setGravity(Gravity.TOP | Gravity.START);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        e.setPadding(dp(14), dp(12), dp(14), dp(12));
        e.setBackground(roundRect(Color.WHITE, 10, BORDER));
        e.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(heightDp)
        ));
        return e;
    }

'''
    if helper_marker not in s:
        raise RuntimeError("MainActivity helper marker not found")
    s = s.replace(helper_marker, helper + helper_marker, 1)

p.write_text(s)

# Bump app version.
p = root / "app/build.gradle.kts"
s = p.read_text()
s = re.sub(r'versionCode\s*=\s*\d+', 'versionCode = 4', s)
s = re.sub(r'versionName\s*=\s*"[^"]+"', 'versionName = "0.3.0"', s)
p.write_text(s)
