from pathlib import Path
import re

root = Path("android/build-src/sms-card-app")
src = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard"

def patch_file(filename, replacements):
    path = src / filename
    body = path.read_text(encoding="utf-8")
    for label, old, new in replacements:
        if old not in body:
            raise RuntimeError(f"{filename}: missing marker {label}")
        body = body.replace(old, new, 1)
    path.write_text(body, encoding="utf-8")

patch_file("PhoneNormalizer.java", [
    ("sms address helper",
     """    public static String display(String number) {
""",
     """    /**
     * A dialable SMS recipient, not an internal deduplication key.
     *
     * Internal Russian numbers remain in the canonical form 7XXXXXXXXXX,
     * while the external SMS intent must always use +7XXXXXXXXXX.
     * International numbers keep their explicit +country prefix.
     * Only '+' and digits can be returned, so this value is safe as the
     * scheme-specific part of a smsto: URI.
     */
    public static String toSmsRecipient(String number) {
        String canonical = normalize(number);
        if (!usable(canonical)) return "";
        if (canonical.length() == 11 && canonical.startsWith("7")) {
            return "+" + canonical;
        }
        return canonical.startsWith("+") ? canonical : "";
    }

    public static String display(String number) {
""")
])

patch_file("SmsComposeActivity.java", [
    ("validate SMS recipient",
     """        Intent sms = new Intent(Intent.ACTION_SENDTO);
        sms.setData(Uri.parse("smsto:" + Uri.encode(normalized)));
        sms.putExtra("sms_body", body);
""",
     """        String smsRecipient = PhoneNormalizer.toSmsRecipient(normalized);
        if (smsRecipient.isEmpty()) {
            Toast.makeText(this, "Неверный номер получателя SMS", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        Intent sms = new Intent(Intent.ACTION_SENDTO);
        // Do not lose '+'! Only '+' and digits occur in this address.
        sms.setData(Uri.parse("smsto:" + smsRecipient));
        sms.putExtra("sms_body", body);
""")
])

patch_file("BulkCampaignActivity.java", [
    ("bulk SMS intent",
     """        Intent sms = new Intent(Intent.ACTION_SENDTO);
        sms.setData(Uri.parse("smsto:" + Uri.encode(recipient.phone)));
        sms.putExtra("sms_body", campaign.message);
""",
     """        String smsRecipient = PhoneNormalizer.toSmsRecipient(recipient.phone);
        if (smsRecipient.isEmpty()) {
            recipient.status = oldStatus;
            BulkCampaignStore.saveActive(this, campaign);
            Toast.makeText(this, "Номер получателя SMS не распознан", Toast.LENGTH_LONG).show();
            return;
        }

        Intent sms = new Intent(Intent.ACTION_SENDTO);
        // Use dialable E.164 (+7...) for the SMS application, never internal 7...
        sms.setData(Uri.parse("smsto:" + smsRecipient));
        sms.putExtra("sms_body", campaign.message);
""")
])

p = root / "app/build.gradle.kts"
body = p.read_text(encoding="utf-8")
body = re.sub(r'versionCode\s*=\s*\d+', 'versionCode = 10', body)
body = re.sub(r'versionName\s*=\s*"[^"]+"', 'versionName = "0.6.1"', body)
p.write_text(body, encoding="utf-8")

# Fail build if either original caller still uses an internal/non-dialable phone number.
assert 'smsto:" + smsRecipient' in (src / "SmsComposeActivity.java").read_text()
assert 'smsto:" + smsRecipient' in (src / "BulkCampaignActivity.java").read_text()
assert 'Uri.encode(normalized)' not in (src / "SmsComposeActivity.java").read_text()
assert 'Uri.encode(recipient.phone)' not in (src / "BulkCampaignActivity.java").read_text()
print("Applied v0.6.1: all smsto: paths now use +7 dialable format")
