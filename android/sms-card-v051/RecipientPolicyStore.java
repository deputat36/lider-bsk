package ru.etagi.borisoglebsk.smscard;

import android.content.Context;
import android.util.AtomicFile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.TimeUnit;

public final class RecipientPolicyStore {
    private static final String FILE_NAME = "recipient_policy.json";
    private static final int MAX_PREPARED = 5000;
    private static final long RETENTION_MS = TimeUnit.DAYS.toMillis(730);

    private RecipientPolicyStore() {}

    public static synchronized long lastPrepared(Context context, String number) {
        String normalized = PhoneNormalizer.normalize(number);
        if (normalized.isEmpty()) return 0L;
        JSONObject root = readRoot(context);
        JSONObject prepared = root.optJSONObject("prepared");
        return prepared == null ? 0L : prepared.optLong(normalized, 0L);
    }

    public static synchronized boolean recordPrepared(Context context, String number) {
        return recordPreparedAt(context, number, System.currentTimeMillis());
    }

    public static synchronized boolean recordPreparedAt(Context context, String number, long when) {
        String normalized = PhoneNormalizer.normalize(number);
        if (normalized.isEmpty() || when <= 0) return false;

        JSONObject root = readRoot(context);
        JSONObject prepared = root.optJSONObject("prepared");
        if (prepared == null) prepared = new JSONObject();

        try {
            prepared.put(normalized, when);
            root.put("prepared", prunePrepared(prepared));
            if (!root.has("blacklist")) root.put("blacklist", new JSONObject());
            return writeRoot(context, root);
        } catch (JSONException e) {
            return false;
        }
    }

    public static synchronized boolean clearPrepared(Context context) {
        JSONObject root = readRoot(context);
        try {
            root.put("prepared", new JSONObject());
            if (!root.has("blacklist")) root.put("blacklist", new JSONObject());
            return writeRoot(context, root);
        } catch (JSONException e) {
            return false;
        }
    }

    public static synchronized boolean isBlacklisted(Context context, String number) {
        String normalized = PhoneNormalizer.normalize(number);
        if (normalized.isEmpty()) return false;
        JSONObject blacklist = readRoot(context).optJSONObject("blacklist");
        return blacklist != null && blacklist.has(normalized);
    }

    public static synchronized boolean setBlacklisted(Context context, String number, String label, boolean blacklisted) {
        String normalized = PhoneNormalizer.normalize(number);
        if (normalized.isEmpty()) return false;

        JSONObject root = readRoot(context);
        JSONObject blacklist = root.optJSONObject("blacklist");
        if (blacklist == null) blacklist = new JSONObject();

        try {
            if (blacklisted) {
                blacklist.put(normalized, label == null ? "" : label.trim());
            } else {
                blacklist.remove(normalized);
            }
            root.put("blacklist", blacklist);
            if (!root.has("prepared")) root.put("prepared", new JSONObject());
            return writeRoot(context, root);
        } catch (JSONException e) {
            return false;
        }
    }

    public static synchronized int blacklistCount(Context context) {
        JSONObject blacklist = readRoot(context).optJSONObject("blacklist");
        return blacklist == null ? 0 : blacklist.length();
    }

    public static synchronized List<BlockedItem> blacklist(Context context) {
        ArrayList<BlockedItem> result = new ArrayList<>();
        JSONObject blacklist = readRoot(context).optJSONObject("blacklist");
        if (blacklist == null) return result;

        Iterator<String> keys = blacklist.keys();
        while (keys.hasNext()) {
            String phone = keys.next();
            result.add(new BlockedItem(phone, blacklist.optString(phone, "")));
        }
        result.sort((a, b) -> a.phone.compareTo(b.phone));
        return result;
    }

    public static synchronized boolean clearBlacklist(Context context) {
        JSONObject root = readRoot(context);
        try {
            root.put("blacklist", new JSONObject());
            if (!root.has("prepared")) root.put("prepared", new JSONObject());
            return writeRoot(context, root);
        } catch (JSONException e) {
            return false;
        }
    }

    private static JSONObject prunePrepared(JSONObject prepared) {
        long cutoff = System.currentTimeMillis() - RETENTION_MS;
        ArrayList<Entry> entries = new ArrayList<>();

        Iterator<String> keys = prepared.keys();
        while (keys.hasNext()) {
            String phone = keys.next();
            long when = prepared.optLong(phone, 0L);
            if (when >= cutoff) entries.add(new Entry(phone, when));
        }

        entries.sort((a, b) -> Long.compare(b.when, a.when));
        JSONObject next = new JSONObject();
        int limit = Math.min(MAX_PREPARED, entries.size());
        for (int i = 0; i < limit; i++) {
            try {
                next.put(entries.get(i).phone, entries.get(i).when);
            } catch (JSONException ignored) {
            }
        }
        return next;
    }

    private static JSONObject readRoot(Context context) {
        AtomicFile file = atomicFile(context);
        try {
            byte[] bytes = file.readFully();
            if (bytes.length == 0) return emptyRoot();
            JSONObject parsed = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (!parsed.has("prepared")) parsed.put("prepared", new JSONObject());
            if (!parsed.has("blacklist")) parsed.put("blacklist", new JSONObject());
            return parsed;
        } catch (FileNotFoundException e) {
            return emptyRoot();
        } catch (Exception e) {
            return emptyRoot();
        }
    }

    private static boolean writeRoot(Context context, JSONObject root) {
        AtomicFile file = atomicFile(context);
        FileOutputStream stream = null;
        try {
            stream = file.startWrite();
            stream.write(root.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(stream);
            return true;
        } catch (Exception e) {
            if (stream != null) file.failWrite(stream);
            return false;
        }
    }

    private static AtomicFile atomicFile(Context context) {
        return new AtomicFile(new File(context.getFilesDir(), FILE_NAME));
    }

    private static JSONObject emptyRoot() {
        JSONObject root = new JSONObject();
        try {
            root.put("prepared", new JSONObject());
            root.put("blacklist", new JSONObject());
        } catch (JSONException ignored) {
        }
        return root;
    }

    private static final class Entry {
        final String phone;
        final long when;
        Entry(String phone, long when) {
            this.phone = phone;
            this.when = when;
        }
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
