from pathlib import Path

root = Path("android/build-src/sms-card-app")
src = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard"

def patch_file(file, replacements):
    p = src / file
    content = p.read_text()
    for name, old, new in replacements:
        if old not in content:
            raise RuntimeError(f"{file}: missing patch marker {name}")
        content = content.replace(old, new, 1)
    p.write_text(content)

phone = r'''package ru.etagi.borisoglebsk.smscard;

import android.telephony.PhoneNumberUtils;

import java.util.Locale;

public final class PhoneNormalizer {
    private PhoneNormalizer() {}

    // Russian national formats are canonical "7XXXXXXXXXX".
    // Other countries require an explicit +country code and keep the '+'.
    // Bare foreign numbers are ambiguous and therefore rejected.
    public static String normalize(String input) {
        if (input == null) return "";
        String trimmed = input.trim();
        if (trimmed.isEmpty()) return "";

        // Do not mistake extension/post-dial digits for part of a subscriber number.
        String network = trimmed.split("(?i)\\s*(?:[,;]|(?:доб\\.?|ext\\.?|extension|#)\\s*\\d+)", 2)[0];
        try {
            String extracted = PhoneNumberUtils.extractNetworkPortion(network);
            if (extracted != null && !extracted.isEmpty()) network = extracted;
        } catch (Throwable ignored) {}

        boolean international = network.trim().startsWith("+");
        String digits = network.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return "";

        if (!international && digits.length() == 11 && digits.startsWith("8")) {
            return "7" + digits.substring(1);
        }
        if (!international && digits.length() == 10 && digits.startsWith("9")) {
            return "7" + digits;
        }
        if (digits.length() == 11 && digits.startsWith("7")) {
            return digits;
        }

        if (international && digits.length() >= 8 && digits.length() <= 15
                && digits.charAt(0) >= '1' && digits.charAt(0) <= '9') {
            return "+" + digits;
        }
        return "";
    }

    public static String display(String number) {
        String normalized = normalize(number);
        if (normalized.length() == 11 && normalized.startsWith("7")) {
            return "+7 " + normalized.substring(1, 4) + " "
                    + normalized.substring(4, 7) + "-"
                    + normalized.substring(7, 9) + "-"
                    + normalized.substring(9);
        }
        return normalized.isEmpty() ? (number == null ? "" : number.trim()) : normalized;
    }

    public static boolean usable(String number) {
        String normalized = normalize(number);
        if (normalized.length() == 11 && normalized.startsWith("7")) return true;
        return normalized.startsWith("+") && normalized.length() >= 9
                && normalized.length() <= 16;
    }

    public static boolean looksLikeRussianMobile(String number) {
        String normalized = normalize(number);
        return normalized.length() == 11 && normalized.startsWith("79");
    }
}
'''
(src / "PhoneNormalizer.java").write_text(phone)

patch_file("SmsComposeActivity.java", [
("validating incoming number",
'''        if (number == null || number.trim().isEmpty()) {
            Toast.makeText(this, "Не удалось определить номер телефона", Toast.LENGTH_LONG).show();
            finish();
            return;
        }


        String body = bodyOverride != null ? bodyOverride : SmsTemplates.build(this, template, clientName);
        if (!skipHistory) {
            String templateName = historyTemplate != null && !historyTemplate.trim().isEmpty()
                    ? historyTemplate
                    : SmsTemplates.NAMES[template];
            HistoryStore.add(this, number, callType == null ? "manual" : callType, templateName);
        }
        NotificationHelper.dismiss(this, notificationId);

        Intent sms = new Intent(Intent.ACTION_SENDTO);
        sms.setData(Uri.parse("smsto:" + Uri.encode(number)));
        sms.putExtra("sms_body", body);

        try {
            startActivity(sms);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "На телефоне не найдено приложение для SMS", Toast.LENGTH_LONG).show();
        }
        finish();
''',
'''        String normalized = PhoneNormalizer.normalize(number);
        if (!PhoneNormalizer.usable(normalized)) {
            Toast.makeText(this, "Номер не распознан. Проверьте формат телефона (+7… или +код страны).", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        if (template < 0 || template >= SmsTemplates.NAMES.length) template = SmsTemplates.UNIVERSAL;

        String body = bodyOverride != null ? bodyOverride : SmsTemplates.build(this, template, clientName);
        if (body.trim().isEmpty() || SmsTemplates.containsUnknownVariables(body)) {
            Toast.makeText(this, "Проверьте шаблон: текст пустой или содержит неизвестные переменные.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        Intent sms = new Intent(Intent.ACTION_SENDTO);
        sms.setData(Uri.parse("smsto:" + Uri.encode(normalized)));
        sms.putExtra("sms_body", body);

        try {
            startActivity(sms);
            NotificationHelper.dismiss(this, notificationId);
            // The SMS composer was opened, not necessarily sent or delivered.
            if (!skipHistory) {
                String templateName = historyTemplate != null && !historyTemplate.trim().isEmpty()
                        ? historyTemplate : SmsTemplates.NAMES[template];
                HistoryStore.add(this, normalized, callType == null ? "manual" : callType, templateName);
            }
        } catch (ActivityNotFoundException | SecurityException e) {
            Toast.makeText(this, "Не удалось открыть SMS. Проверьте приложение сообщений.", Toast.LENGTH_LONG).show();
        }
        finish();
''')
])

patch_file("SmsTemplates.java", [
("validation insert",
'''    public static String build(Context c, int template, String clientName) {
''',
'''    public static boolean containsUnknownVariables(String text) {
        if (text == null) return false;
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("\\\\{[A-Za-z_][A-Za-z0-9_]*\\\\}")
                .matcher(text);
        while (matcher.find()) {
            boolean known = false;
            for (String token : VARIABLE_TOKENS) {
                if (token.equals(matcher.group())) {
                    known = true;
                    break;
                }
            }
            if (!known) return true;
        }
        return false;
    }

    public static String build(Context c, int template, String clientName) {
''')
])

p=root/"app/build.gradle.kts"
c=p.read_text().replace('versionCode = 7','versionCode = 8').replace('versionName = "0.5.1"','versionName = "0.5.2"')
if 'versionName = "0.5.2"' not in c: raise RuntimeError("version marker")
p.write_text(c)
print("Core patch applied.")
