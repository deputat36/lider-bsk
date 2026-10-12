package ru.etagi.borisoglebsk.smscard;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** SQLite operations; campaign recipients are updated by changed status, not rewritten wholesale. */
public final class SqliteStores {
    private SqliteStores() {}

    private static SQLiteDatabase db(Context context) {
        return SmsDatabase.instance(context).open();
    }

    public static synchronized BulkCampaignStore.Campaign active(Context context) {
        SQLiteDatabase database = db(context);
        try (Cursor c = database.rawQuery(
                "SELECT id,title,message,created_at,finished_at,paused,current_index " +
                "FROM campaigns WHERE state='active' ORDER BY created_at DESC LIMIT 1", null)) {
            if (!c.moveToFirst()) return null;
            BulkCampaignStore.Campaign campaign = new BulkCampaignStore.Campaign();
            campaign.id = c.getString(0);
            campaign.title = c.getString(1);
            campaign.message = c.getString(2);
            campaign.createdAt = c.getLong(3);
            campaign.finishedAt = c.getLong(4);
            campaign.paused = c.getInt(5) == 1;
            campaign.currentIndex = c.getInt(6);
            try (Cursor rows = database.rawQuery(
                    "SELECT name,phone,status FROM campaign_recipients " +
                    "WHERE campaign_id=? ORDER BY seq", new String[]{campaign.id})) {
                while (rows.moveToNext()) {
                    campaign.recipients.add(new BulkCampaignStore.Recipient(
                            rows.getString(0), rows.getString(1), rows.getString(2)));
                }
            }
            campaign.advanceIndex();
            return campaign;
        }
    }

    public static synchronized boolean saveActive(Context context, BulkCampaignStore.Campaign campaign) {
        if (campaign == null) return false;
        SQLiteDatabase database = db(context);
        database.beginTransaction();
        try {
            Map<Integer, String> prior = new HashMap<>();
            try (Cursor c = database.rawQuery(
                    "SELECT seq,status FROM campaign_recipients WHERE campaign_id=?",
                    new String[]{campaign.id})) {
                while (c.moveToNext()) prior.put(c.getInt(0), c.getString(1));
            }

            ContentValues values = new ContentValues();
            values.put("id", campaign.id);
            values.put("title", campaign.title);
            values.put("message", campaign.message);
            values.put("created_at", campaign.createdAt);
            values.put("finished_at", campaign.finishedAt);
            values.put("paused", campaign.paused ? 1 : 0);
            values.put("current_index", campaign.currentIndex);
            values.put("state", "active");
            values.put("total", campaign.totalCount());
            values.put("prepared", campaign.preparedCount());
            values.put("skipped", campaign.skippedCount());

            if (prior.isEmpty()) {
                long inserted = database.insertWithOnConflict(
                        "campaigns", null, values, SQLiteDatabase.CONFLICT_IGNORE);
                if (inserted < 0) database.update("campaigns", values, "id=?",
                        new String[]{campaign.id});
            } else {
                database.update("campaigns", values, "id=?", new String[]{campaign.id});
            }

            for (int i=0;i<campaign.recipients.size();i++) {
                BulkCampaignStore.Recipient item = campaign.recipients.get(i);
                String oldStatus = prior.remove(i);
                if (oldStatus == null) {
                    ContentValues row = new ContentValues();
                    row.put("campaign_id", campaign.id);
                    row.put("seq", i);
                    row.put("name", item.name);
                    row.put("phone", item.phone);
                    row.put("status", item.status);
                    database.insertOrThrow("campaign_recipients", null, row);
                } else if (!oldStatus.equals(item.status)) {
                    ContentValues row = new ContentValues();
                    row.put("status", item.status);
                    database.update("campaign_recipients", row, "campaign_id=? AND seq=?",
                            new String[]{campaign.id, String.valueOf(i)});
                }
            }
            // Do not silently remove recipients when in-memory state is incomplete.
            if (!prior.isEmpty()) throw new IllegalStateException("Recipient set unexpectedly shrank");
            database.setTransactionSuccessful();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            database.endTransaction();
        }
    }

    public static synchronized boolean finish(Context context, BulkCampaignStore.Campaign campaign,
                                               boolean cancelled) {
        if (campaign == null) return false;
        SQLiteDatabase database = db(context);
        database.beginTransaction();
        try {
            ContentValues values = new ContentValues();
            values.put("id", campaign.id);
            values.put("title", campaign.title);
            values.put("message", campaign.message);
            values.put("created_at", campaign.createdAt);
            values.put("finished_at", System.currentTimeMillis());
            values.put("paused", 0);
            values.put("current_index", campaign.currentIndex);
            values.put("state", cancelled ? "cancelled" : "finished");
            values.put("total", campaign.totalCount());
            values.put("prepared", campaign.preparedCount());
            values.put("skipped", campaign.skippedCount());
            database.insertWithOnConflict("campaigns", null, values, SQLiteDatabase.CONFLICT_REPLACE);
            database.delete("campaign_recipients", "campaign_id=?", new String[]{campaign.id});
            database.setTransactionSuccessful();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            database.endTransaction();
        }
    }

    public static synchronized void clearActive(Context context) {
        SQLiteDatabase database = db(context);
        database.delete("campaigns", "state='active'", null);
    }

    public static synchronized List<BulkCampaignStore.Summary> campaignHistory(Context context) {
        List<BulkCampaignStore.Summary> result = new ArrayList<>();
        try (Cursor c = db(context).rawQuery(
                "SELECT id,title,created_at,finished_at,total,prepared,skipped,state " +
                "FROM campaigns WHERE state!='active' ORDER BY finished_at DESC LIMIT 20", null)) {
            while (c.moveToNext()) {
                BulkCampaignStore.Summary item = new BulkCampaignStore.Summary();
                item.id = c.getString(0);
                item.title = c.getString(1);
                item.createdAt = c.getLong(2);
                item.finishedAt = c.getLong(3);
                item.total = c.getInt(4);
                item.prepared = c.getInt(5);
                item.skipped = c.getInt(6);
                item.cancelled = "cancelled".equals(c.getString(7));
                result.add(item);
            }
        }
        return result;
    }

    public static synchronized void clearCampaignHistory(Context context) {
        db(context).delete("campaigns", "state!='active'", null);
    }

    public static synchronized void addHistory(Context context, String phone,
                                               String callType, String template) {
        SQLiteDatabase database = db(context);
        String normalized = PhoneNormalizer.normalize(phone);
        if (!PhoneNormalizer.usable(normalized)) return;
        long now = System.currentTimeMillis();
        database.beginTransaction();
        try {
            ContentValues row = new ContentValues();
            row.put("phone", normalized);
            row.put("call_type", callType == null ? "manual" : callType);
            row.put("template", template == null ? "" : template);
            row.put("prepared_at", now);
            database.insertOrThrow("sms_history", null, row);
            ContentValues ledger = new ContentValues();
            ledger.put("phone", normalized);
            ledger.put("prepared_at", now);
            database.insertWithOnConflict("prepared_ledger", null, ledger,
                    SQLiteDatabase.CONFLICT_REPLACE);
            database.execSQL("DELETE FROM sms_history WHERE id NOT IN " +
                    "(SELECT id FROM sms_history ORDER BY id DESC LIMIT 500)");
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    public static synchronized List<HistoryStore.Item> history(Context context) {
        List<HistoryStore.Item> result = new ArrayList<>();
        try (Cursor c = db(context).rawQuery(
                "SELECT phone,call_type,template,prepared_at FROM sms_history " +
                "ORDER BY prepared_at DESC,id DESC LIMIT 500", null)) {
            while (c.moveToNext()) result.add(
                    new HistoryStore.Item(c.getString(0), c.getString(1),
                            c.getString(2), c.getLong(3)));
        }
        return result;
    }

    public static synchronized void clearHistory(Context context) {
        SQLiteDatabase database = db(context);
        database.beginTransaction();
        try {
            database.delete("sms_history", null, null);
            database.delete("prepared_ledger", null, null);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    public static synchronized long lastPrepared(Context context, String phone) {
        String normalized = PhoneNormalizer.normalize(phone);
        if (normalized.isEmpty()) return 0L;
        try (Cursor c = db(context).rawQuery(
                "SELECT prepared_at FROM prepared_ledger WHERE phone=?", new String[]{normalized})) {
            return c.moveToFirst() ? c.getLong(0) : 0L;
        }
    }

    public static synchronized boolean recordPrepared(Context context, String phone, long at) {
        String normalized = PhoneNormalizer.normalize(phone);
        if (normalized.isEmpty() || at <= 0) return false;
        SQLiteDatabase database = db(context);
        database.beginTransaction();
        try {
            database.execSQL("INSERT OR IGNORE INTO prepared_ledger(phone,prepared_at) VALUES(?,?)",
                    new Object[]{normalized, at});
            database.execSQL("UPDATE prepared_ledger SET prepared_at=MAX(prepared_at,?) WHERE phone=?",
                    new Object[]{at, normalized});
            database.setTransactionSuccessful();
            return true;
        } finally {
            database.endTransaction();
        }
    }

    public static synchronized boolean clearPrepared(Context context) {
        db(context).delete("prepared_ledger", null, null);
        return true;
    }

    public static synchronized boolean blocked(Context context, String phone) {
        String normalized = PhoneNormalizer.normalize(phone);
        if (normalized.isEmpty()) return false;
        try (Cursor c = db(context).rawQuery(
                "SELECT 1 FROM stoplist WHERE phone=?", new String[]{normalized})) {
            return c.moveToFirst();
        }
    }

    public static synchronized boolean setBlocked(Context context, String phone,
                                                   String label, boolean blocked) {
        String normalized = PhoneNormalizer.normalize(phone);
        if (normalized.isEmpty()) return false;
        if (blocked) {
            ContentValues row = new ContentValues();
            row.put("phone", normalized);
            row.put("label", label == null ? "" : label);
            return db(context).insertWithOnConflict(
                    "stoplist", null, row, SQLiteDatabase.CONFLICT_REPLACE) != -1;
        }
        db(context).delete("stoplist", "phone=?", new String[]{normalized});
        return true;
    }

    public static synchronized int blockedCount(Context context) {
        try (Cursor c = db(context).rawQuery("SELECT COUNT(*) FROM stoplist", null)) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    public static synchronized Set<String> blockedNumbers(Context context) {
        Set<String> result = new HashSet<>();
        try (Cursor c = db(context).rawQuery("SELECT phone FROM stoplist", null)) {
            while (c.moveToNext()) result.add(c.getString(0));
        }
        return result;
    }

    public static synchronized Set<String> preparedSince(Context context, long cutoff) {
        Set<String> result = new HashSet<>();
        try (Cursor c = db(context).rawQuery(
                "SELECT phone FROM prepared_ledger WHERE prepared_at>=?",
                new String[]{String.valueOf(cutoff)})) {
            while (c.moveToNext()) result.add(c.getString(0));
        }
        return result;
    }

    public static synchronized List<RecipientPolicyStore.BlockedItem> blacklist(Context context) {
        List<RecipientPolicyStore.BlockedItem> result = new ArrayList<>();
        try (Cursor c = db(context).rawQuery(
                "SELECT phone,label FROM stoplist ORDER BY phone", null)) {
            while (c.moveToNext()) result.add(
                    new RecipientPolicyStore.BlockedItem(c.getString(0), c.getString(1)));
        }
        return result;
    }

    public static synchronized boolean clearBlacklist(Context context) {
        db(context).delete("stoplist", null, null);
        return true;
    }

    public static synchronized void logEvent(Context context, String code, String detail) {
        try {
            SQLiteDatabase database = db(context);
            ContentValues row = new ContentValues();
            row.put("time", System.currentTimeMillis());
            row.put("code", code == null ? "" : code);
            row.put("details", detail == null ? "" : detail);
            database.insert("diagnostic_events", null, row);
            database.execSQL("DELETE FROM diagnostic_events WHERE id NOT IN " +
                    "(SELECT id FROM diagnostic_events ORDER BY id DESC LIMIT 200)");
        } catch (RuntimeException ignored) {}
    }

    public static synchronized List<String> lastEvents(Context context, int maxItems) {
        List<String> result = new ArrayList<>();
        try (Cursor c = db(context).rawQuery(
                "SELECT time,code,details FROM diagnostic_events ORDER BY id DESC LIMIT ?",
                new String[]{String.valueOf(Math.max(1, Math.min(maxItems, 100)))})) {
            while (c.moveToNext()) result.add(
                    new java.text.SimpleDateFormat("dd.MM HH:mm", java.util.Locale.getDefault())
                            .format(new java.util.Date(c.getLong(0))) +
                    " • " + c.getString(1) +
                    (c.getString(2).isEmpty() ? "" : " — " + c.getString(2)));
        }
        return result;
    }
    /** Read-only health check for the settings diagnostics panel. */
    public static synchronized String healthReport(Context context) {
        try {
            SQLiteDatabase database = db(context);
            String integrity = "неизвестно";
            try (Cursor cursor = database.rawQuery("PRAGMA quick_check(1)", null)) {
                if (cursor.moveToFirst()) integrity = cursor.getString(0);
            }
            if (!"ok".equalsIgnoreCase(integrity)) {
                return "⚠ База данных: " + integrity;
            }
            long active = count(database, "SELECT COUNT(*) FROM campaigns WHERE state='active'");
            long history = count(database, "SELECT COUNT(*) FROM sms_history");
            long blocked = count(database, "SELECT COUNT(*) FROM stoplist");
            return "SQLite: исправна • активных кампаний: " + active
                    + " • записей истории: " + history + " • стоп-лист: " + blocked;
        } catch (Exception e) {
            return "⚠ Проверка SQLite не удалась: " + e.getClass().getSimpleName();
        }
    }

    private static long count(SQLiteDatabase database, String query) {
        try (Cursor c = database.rawQuery(query, null)) {
            return c.moveToFirst() ? c.getLong(0) : 0L;
        }
    }

}
