package ru.etagi.borisoglebsk.smscard;

import android.content.Context;
import java.util.List;
import java.util.Set;

/** Backwards-compatible stop-list / repeat API backed by SQLite. */
public final class RecipientPolicyStore {
    private RecipientPolicyStore() {}

    public static synchronized long lastPrepared(Context c, String number) {
        return SqliteStores.lastPrepared(c, number);
    }

    public static synchronized boolean recordPrepared(Context c, String number) {
        return recordPreparedAt(c, number, System.currentTimeMillis());
    }

    public static synchronized boolean recordPreparedAt(Context c, String number, long when) {
        return SqliteStores.recordPrepared(c, number, when);
    }

    public static synchronized boolean clearPrepared(Context c) {
        return SqliteStores.clearPrepared(c);
    }

    public static synchronized boolean isBlacklisted(Context c, String number) {
        return SqliteStores.blocked(c, number);
    }

    public static synchronized boolean setBlacklisted(Context c, String number,
                                                       String label, boolean blocked) {
        return SqliteStores.setBlocked(c, number, label, blocked);
    }

    public static synchronized int blacklistCount(Context c) {
        return SqliteStores.blockedCount(c);
    }

    public static synchronized Set<String> blacklistedNumbers(Context c) {
        return SqliteStores.blockedNumbers(c);
    }

    public static synchronized Set<String> preparedSince(Context c, long cutoff) {
        return SqliteStores.preparedSince(c, cutoff);
    }

    public static synchronized List<BlockedItem> blacklist(Context c) {
        return SqliteStores.blacklist(c);
    }

    public static synchronized boolean clearBlacklist(Context c) {
        return SqliteStores.clearBlacklist(c);
    }

    public static final class BlockedItem {
        public final String phone;
        public final String label;

        public BlockedItem(String phone, String label) {
            this.phone = phone;
            this.label = label == null ? "" : label;
        }
    }
}
