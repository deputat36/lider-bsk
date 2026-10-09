package ru.etagi.borisoglebsk.smscard;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.concurrent.TimeUnit;

public final class CallSessionStore {
    public static final String TYPE_INCOMING = "incoming";
    public static final String TYPE_OUTGOING = "outgoing";
    public static final String TYPE_MISSED = "missed";

    private static final String PREFS = "call_session";
    private static final long MAX_PENDING_AGE_MS = TimeUnit.HOURS.toMillis(12);
    private static final long FUTURE_TOLERANCE_MS = TimeUnit.MINUTES.toMillis(5);

    private CallSessionStore() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void begin(Context c, String number, String direction) {
        p(c).edit()
                .putString("number", number == null ? "" : PhoneNormalizer.normalize(number))
                .putString("direction", direction == null ? "" : direction)
                .putLong("created", System.currentTimeMillis())
                .putBoolean("offhook", false)
                .apply();
    }

    public static void markOffhook(Context c) {
        Session current = rawCurrent(c);
        if (!current.isFresh(System.currentTimeMillis())) {
            clearPending(c);
            return;
        }
        p(c).edit().putBoolean("offhook", true).apply();
    }

    public static Session current(Context c) {
        Session session = rawCurrent(c);
        if (!session.isFresh(System.currentTimeMillis())) {
            clearPending(c);
            return Session.empty();
        }
        return session;
    }

    private static Session rawCurrent(Context c) {
        return new Session(
                p(c).getString("number", ""),
                p(c).getString("direction", ""),
                p(c).getLong("created", 0L),
                p(c).getBoolean("offhook", false)
        );
    }

    public static void complete(Context c, String number, String type) {
        p(c).edit()
                .putString("last_number", number == null ? "" : PhoneNormalizer.normalize(number))
                .putString("last_type", type == null ? "" : type)
                .putLong("last_time", System.currentTimeMillis())
                .remove("number")
                .remove("direction")
                .remove("created")
                .remove("offhook")
                .apply();
    }

    public static String lastNumber(Context c) {
        return p(c).getString("last_number", "");
    }

    public static String lastType(Context c) {
        return p(c).getString("last_type", "");
    }

    public static void clearPending(Context c) {
        p(c).edit().remove("number").remove("direction").remove("created").remove("offhook").apply();
    }

    public static final class Session {
        public final String number;
        public final String direction;
        public final long created;
        public final boolean offhook;

        public Session(String number, String direction, long created, boolean offhook) {
            this.number = number == null ? "" : number;
            this.direction = direction == null ? "" : direction;
            this.created = created;
            this.offhook = offhook;
        }

        static Session empty() {
            return new Session("", "", 0L, false);
        }

        public boolean isValid() {
            return isFresh(System.currentTimeMillis());
        }

        public boolean isFresh(long now) {
            if (number.trim().isEmpty() || direction.trim().isEmpty() || created <= 0) return false;
            long age = now - created;
            return age >= -FUTURE_TOLERANCE_MS && age <= MAX_PENDING_AGE_MS;
        }
    }
}
