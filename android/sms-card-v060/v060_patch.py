from pathlib import Path
import re

root = Path("android/build-src/sms-card-app")
src = root / "app/src/main/java/ru/etagi/borisoglebsk/smscard"

p = src / "BulkCampaignStore.java"
s = p.read_text()
marker = "    public static final class Recipient {"
assert marker in s
nested = s[s.index(marker):]
prefix = '''package ru.etagi.borisoglebsk.smscard;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public final class BulkCampaignStore {
    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_OPENED = "opened";
    public static final String STATUS_PREPARED = "prepared";
    public static final String STATUS_SKIPPED = "skipped";

    private BulkCampaignStore() {}

    public static synchronized Campaign active(Context c) {
        return SqliteStores.active(c);
    }
    public static synchronized boolean saveActive(Context c, Campaign campaign) {
        return SqliteStores.saveActive(c, campaign);
    }
    public static synchronized void clearActive(Context c) {
        SqliteStores.clearActive(c);
    }
    public static synchronized List<Summary> history(Context c) {
        return SqliteStores.campaignHistory(c);
    }
    public static synchronized boolean finish(Context c, Campaign campaign, boolean cancelled) {
        return SqliteStores.finish(c, campaign, cancelled);
    }
    public static synchronized void clearHistory(Context c) {
        SqliteStores.clearCampaignHistory(c);
    }
'''
p.write_text(prefix + "\n" + nested)

p = src / "CallSessionStore.java"
s = p.read_text()
start = '''    public static void begin(Context c, String number, String direction) {
        p(c).edit()
'''
assert start in s
s = s.replace(start, '''    public static void begin(Context c, String number, String direction) {
        Session previous = rawCurrent(c);
        String normalized = PhoneNormalizer.normalize(number);
        if (previous.isFresh(System.currentTimeMillis())
                && !previous.number.equals(normalized)) {
            p(c).edit().putBoolean("ambiguous", true).commit();
            SqliteStores.logEvent(c, "call_ambiguous", "Параллельные звонки; номер не определяем");
            return;
        }
        p(c).edit().remove("ambiguous")
''',1)
s = s.replace('''    public static Session current(Context c) {
        Session session = rawCurrent(c);
''','''    public static boolean ambiguous(Context c) {
        return p(c).getBoolean("ambiguous", false);
    }

    public static Session current(Context c) {
        if (ambiguous(c)) return Session.empty();
        Session session = rawCurrent(c);
''',1)
s = s.replace('''                .remove("offhook")
                .apply();''','''                .remove("offhook")
                .remove("ambiguous")
                .apply();''')
s = s.replace('''    public static void clearPending(Context c) {
        p(c).edit().remove("number").remove("direction").remove("created").remove("offhook").apply();
''','''    public static void clearPending(Context c) {
        p(c).edit().remove("number").remove("direction").remove("created")
                .remove("offhook").remove("ambiguous").apply();
''')
p.write_text(s)

p = src / "CallStateReceiver.java"
s = p.read_text()
needle='''        CallSessionStore.Session session = CallSessionStore.current(context);
'''
assert needle in s
s=s.replace(needle,'''        if (CallSessionStore.ambiguous(context)) {
            CallSessionStore.clearPending(context);
            SqliteStores.logEvent(context, "call_skipped", "Наложение вызовов; уведомление не показывалось");
            return;
        }
        CallSessionStore.Session session = CallSessionStore.current(context);
''',1)
s=s.replace('''        NotificationHelper.showAfterCall(context, session.number, callType);
''','''        NotificationHelper.showAfterCall(context, session.number, callType);
        SqliteStores.logEvent(context, "offer_notification", "Создано предложение SMS после звонка");
''',1)
p.write_text(s)

p = src / "SmsComposeActivity.java"
s=p.read_text()
s=s.replace('''            startActivity(sms);
            NotificationHelper.dismiss(this, notificationId);
''','''            startActivity(sms);
            SqliteStores.logEvent(this, "sms_composer", "Открыто штатное приложение SMS");
            NotificationHelper.dismiss(this, notificationId);
''',1)
s=s.replace('''        } catch (ActivityNotFoundException | SecurityException e) {
            Toast.makeText(this, "Не удалось открыть SMS. Проверьте приложение сообщений.", Toast.LENGTH_LONG).show();
''','''        } catch (ActivityNotFoundException | SecurityException e) {
            SqliteStores.logEvent(this, "sms_error", "Не удалось открыть штатное приложение SMS");
            Toast.makeText(this, "Не удалось открыть SMS. Проверьте приложение сообщений.", Toast.LENGTH_LONG).show();
''',1)
p.write_text(s)

p = src / "MainActivity.java"
s=p.read_text()
marker='''        diagnostics.addView(small(DeviceDiagnostics.manufacturerAdvice()), topMargin(10));
'''
assert marker in s
s=s.replace(marker,marker+'''
        diagnostics.addView(sectionTitle("Последние события"), topMargin(14));
        List<String> eventLines = SqliteStores.lastEvents(this, 8);
        if (eventLines.isEmpty()) {
            diagnostics.addView(small("Пока нет диагностических событий."));
        } else {
            for (String eventLine : eventLines) {
                diagnostics.addView(small(eventLine), topMargin(4));
            }
        }
''',1)
p.write_text(s)

p = root / "app/build.gradle.kts"
s=p.read_text()
s = re.sub(r'versionCode\s*=\s*\d+', 'versionCode = 9', s)
s = re.sub(r'versionName\s*=\s*"[^"]+"', 'versionName = "0.6.0"', s)
p.write_text(s)

print("Applied SQLite adapters, defensive dual-call detection, diagnostics and v0.6.0 metadata")
