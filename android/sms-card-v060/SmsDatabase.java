package ru.etagi.borisoglebsk.smscard;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.AtomicFile;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/**
 * Database for v0.6.0. Legacy JSON/SharedPreferences data are migrated once
 * in a single transaction; legacy data are not deleted after migration.
 */
public final class SmsDatabase extends SQLiteOpenHelper {
    private static final String TAG = "SmsCardDB";
    private static final String NAME = "sms_vizitka.db";
    private static final int VERSION = 1;
    private static volatile SmsDatabase INSTANCE;

    private final Context app;
    private boolean migrationChecked;

    private SmsDatabase(Context context) {
        super(context.getApplicationContext(), NAME, null, VERSION);
        app = context.getApplicationContext();
        setWriteAheadLoggingEnabled(true);
    }

    public static SmsDatabase instance(Context context) {
        if (INSTANCE == null) {
            synchronized (SmsDatabase.class) {
                if (INSTANCE == null) INSTANCE = new SmsDatabase(context);
            }
        }
        return INSTANCE;
    }

    public synchronized SQLiteDatabase open() {
        SQLiteDatabase db = getWritableDatabase();
        if (!migrationChecked) {
            migrate(db);
            migrationChecked = true;
        }
        return db;
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS campaigns (" +
                "id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, " +
                "created_at INTEGER NOT NULL, finished_at INTEGER NOT NULL DEFAULT 0, " +
                "paused INTEGER NOT NULL DEFAULT 0, current_index INTEGER NOT NULL DEFAULT 0, " +
                "state TEXT NOT NULL DEFAULT 'active', total INTEGER NOT NULL DEFAULT 0, " +
                "prepared INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE TABLE IF NOT EXISTS campaign_recipients (" +
                "campaign_id TEXT NOT NULL, seq INTEGER NOT NULL, name TEXT NOT NULL, " +
                "phone TEXT NOT NULL, status TEXT NOT NULL, " +
                "PRIMARY KEY(campaign_id, seq), " +
                "FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_campaign_state ON campaigns(state,created_at)");
        db.execSQL("CREATE TABLE IF NOT EXISTS sms_history (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, " +
                "call_type TEXT NOT NULL, template TEXT NOT NULL, prepared_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_history_time ON sms_history(prepared_at DESC)");
        db.execSQL("CREATE TABLE IF NOT EXISTS prepared_ledger (" +
                "phone TEXT PRIMARY KEY, prepared_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_prepared_time ON prepared_ledger(prepared_at)");
        db.execSQL("CREATE TABLE IF NOT EXISTS stoplist (" +
                "phone TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '')");
        db.execSQL("CREATE TABLE IF NOT EXISTS diagnostic_events (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER NOT NULL, " +
                "code TEXT NOT NULL, details TEXT NOT NULL DEFAULT '')");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Never use DROP TABLE here: all customer/campaign data must survive upgrades.
        throw new IllegalStateException("Migration for DB version " + oldVersion +
                " -> " + newVersion + " must be explicitly implemented");
    }

    private void migrate(SQLiteDatabase db) {
        try (Cursor cursor = db.rawQuery(
                "SELECT value FROM meta WHERE key='migrated_from_v052'", null)) {
            if (cursor.moveToFirst() && "1".equals(cursor.getString(0))) return;
        }

        db.beginTransaction();
        try {
            migrateCampaigns(db);
            migratePolicies(db);
            migrateHistory(db);
            ContentValues v = new ContentValues();
            v.put("key", "migrated_from_v052");
            v.put("value", "1");
            db.insertWithOnConflict("meta", null, v, SQLiteDatabase.CONFLICT_REPLACE);
            db.setTransactionSuccessful();
        } catch (Exception e) {
            Log.e(TAG, "Migration aborted; legacy files preserved", e);
            throw new IllegalStateException("Не удалось перенести историю и рассылки. Старые файлы сохранены.", e);
        } finally {
            db.endTransaction();
        }
    }

    private void migrateCampaigns(SQLiteDatabase db) throws Exception {
        String oldActive = oldJson("bulk_campaign_active.json");
        if (!oldActive.isEmpty()) {
            JSONObject root = new JSONObject(oldActive);
            insertCampaign(db, root, "active");
        }
        String oldHistory = oldJson("bulk_campaign_history.json");
        if (!oldHistory.isEmpty()) {
            JSONArray items = new JSONArray(oldHistory);
            for (int i=0;i<items.length();i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null) insertCampaign(db, item,
                        item.optBoolean("cancelled") ? "cancelled" : "finished");
            }
        }
    }

    private void insertCampaign(SQLiteDatabase db, JSONObject root, String state) throws Exception {
        String id = root.optString("id");
        if (id.isEmpty()) return;
        ContentValues v = new ContentValues();
        v.put("id", id);
        v.put("title", root.optString("title", "Рассылка"));
        v.put("message", root.optString("message", ""));
        v.put("created_at", root.optLong("created_at"));
        v.put("finished_at", root.optLong("finished_at"));
        v.put("paused", root.optBoolean("paused") ? 1 : 0);
        v.put("current_index", root.optInt("current_index"));
        v.put("state", state);
        v.put("total", root.optInt("total", 0));
        v.put("prepared", root.optInt("prepared", 0));
        v.put("skipped", root.optInt("skipped", 0));
        JSONArray recipients = root.optJSONArray("recipients");
        if (recipients != null && "active".equals(state)) {
            v.put("total", recipients.length());
            int prepared = 0, skipped = 0;
            for (int i=0;i<recipients.length();i++) {
                JSONObject recipient = recipients.optJSONObject(i);
                if (recipient == null) continue;
                String status = recipient.optString("status", "pending");
                if ("prepared".equals(status)) prepared++;
                if ("skipped".equals(status)) skipped++;
                ContentValues row = new ContentValues();
                row.put("campaign_id", id);
                row.put("seq", i);
                row.put("name", recipient.optString("name"));
                row.put("phone", recipient.optString("phone"));
                row.put("status", status);
                // Campaign parent must exist for FK. Insert recipients after parent.
                // Collecting counts here does not mutate the source files.
            }
            v.put("prepared", prepared);
            v.put("skipped", skipped);
        }
        db.insertWithOnConflict("campaigns", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        if (recipients != null && "active".equals(state)) {
            for (int i=0;i<recipients.length();i++) {
                JSONObject recipient = recipients.optJSONObject(i);
                if (recipient == null) continue;
                ContentValues row = new ContentValues();
                row.put("campaign_id", id);
                row.put("seq", i);
                row.put("name", recipient.optString("name"));
                row.put("phone", recipient.optString("phone"));
                row.put("status", recipient.optString("status", "pending"));
                db.insertWithOnConflict("campaign_recipients", null, row,
                        SQLiteDatabase.CONFLICT_REPLACE);
            }
        }
    }

    private void migratePolicies(SQLiteDatabase db) throws Exception {
        String raw = oldJson("recipient_policy.json");
        if (raw.isEmpty()) return;
        JSONObject policy = new JSONObject(raw);
        JSONObject prepared = policy.optJSONObject("prepared");
        if (prepared != null) {
            Iterator<String> keys = prepared.keys();
            while (keys.hasNext()) {
                String phone = keys.next();
                ContentValues v = new ContentValues();
                v.put("phone", phone);
                v.put("prepared_at", prepared.optLong(phone));
                db.insertWithOnConflict("prepared_ledger", null, v, SQLiteDatabase.CONFLICT_REPLACE);
            }
        }
        JSONObject blocked = policy.optJSONObject("blacklist");
        if (blocked != null) {
            Iterator<String> keys = blocked.keys();
            while (keys.hasNext()) {
                String phone = keys.next();
                ContentValues v = new ContentValues();
                v.put("phone", phone);
                v.put("label", blocked.optString(phone));
                db.insertWithOnConflict("stoplist", null, v, SQLiteDatabase.CONFLICT_REPLACE);
            }
        }
    }

    private void migrateHistory(SQLiteDatabase db) throws Exception {
        String raw = app.getSharedPreferences("sms_card_history", Context.MODE_PRIVATE)
                .getString("items", "[]");
        JSONArray history = new JSONArray(raw);
        for (int i=history.length()-1;i>=0;i--) {
            JSONObject item = history.optJSONObject(i);
            if (item == null) continue;
            String phone = item.optString("number");
            long time = item.optLong("time");
            ContentValues v = new ContentValues();
            v.put("phone", phone);
            v.put("call_type", item.optString("type", "manual"));
            v.put("template", item.optString("template"));
            v.put("prepared_at", time);
            db.insertOrThrow("sms_history", null, v);
            if (!phone.isEmpty() && time > 0) {
                db.execSQL("INSERT OR REPLACE INTO prepared_ledger(phone,prepared_at) " +
                        "SELECT ?, MAX(COALESCE((SELECT prepared_at FROM prepared_ledger WHERE phone=?),0),?)",
                        new Object[]{phone, phone, time});
            }
        }
    }

    private String oldJson(String fileName) throws Exception {
        File file = new File(app.getFilesDir(), fileName);
        if (!file.exists()) return "";
        byte[] bytes = new AtomicFile(file).readFully();
        return new String(bytes, StandardCharsets.UTF_8);
    }
}
