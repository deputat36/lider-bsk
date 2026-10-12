package ru.etagi.borisoglebsk.smscard;

import android.content.Context;
import java.util.List;

/** Backwards-compatible public API, now stored in SQLite. */
public final class HistoryStore {
    private HistoryStore() {}

    public static synchronized void add(Context c, String number, String callType, String templateName) {
        SqliteStores.addHistory(c, number, callType, templateName);
    }

    public static synchronized List<Item> list(Context c) {
        return SqliteStores.history(c);
    }

    public static synchronized long lastPreparedFor(Context c, String number) {
        return SqliteStores.lastPrepared(c, number);
    }

    public static synchronized void clear(Context c) {
        SqliteStores.clearHistory(c);
    }

    public static final class Item {
        public final String number;
        public final String type;
        public final String template;
        public final long time;

        public Item(String number, String type, String template, long time) {
            this.number = number;
            this.type = type;
            this.template = template;
            this.time = time;
        }
    }
}
