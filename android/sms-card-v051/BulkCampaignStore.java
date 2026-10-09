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
import java.util.List;

public final class BulkCampaignStore {
    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_OPENED = "opened";
    public static final String STATUS_PREPARED = "prepared";
    public static final String STATUS_SKIPPED = "skipped";

    private static final String ACTIVE_FILE = "bulk_campaign_active.json";
    private static final String HISTORY_FILE = "bulk_campaign_history.json";
    private static final int MAX_HISTORY = 20;

    private BulkCampaignStore() {}

    public static synchronized Campaign active(Context context) {
        String raw = readFile(new File(context.getFilesDir(), ACTIVE_FILE));
        if (raw.isEmpty()) return null;
        try {
            return Campaign.fromJson(new JSONObject(raw));
        } catch (Exception ignored) {
            return null;
        }
    }

    public static synchronized boolean saveActive(Context context, Campaign campaign) {
        if (campaign == null) {
            clearActive(context);
            return true;
        }
        return writeFile(new File(context.getFilesDir(), ACTIVE_FILE), campaign.toJson().toString());
    }

    public static synchronized void clearActive(Context context) {
        new AtomicFile(new File(context.getFilesDir(), ACTIVE_FILE)).delete();
    }

    public static synchronized List<Summary> history(Context context) {
        ArrayList<Summary> result = new ArrayList<>();
        String raw = readFile(new File(context.getFilesDir(), HISTORY_FILE));
        if (raw.isEmpty()) return result;
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject object = arr.optJSONObject(i);
                if (object != null) result.add(Summary.fromJson(object));
            }
        } catch (JSONException ignored) {
        }
        return result;
    }

    public static synchronized boolean finish(Context context, Campaign campaign, boolean cancelled) {
        if (campaign == null) return false;
        campaign.finishedAt = System.currentTimeMillis();
        Summary summary = Summary.fromCampaign(campaign, cancelled);

        JSONArray next = new JSONArray();
        next.put(summary.toJson());
        List<Summary> old = history(context);
        for (Summary item : old) {
            if (next.length() >= MAX_HISTORY) break;
            next.put(item.toJson());
        }

        boolean saved = writeFile(new File(context.getFilesDir(), HISTORY_FILE), next.toString());
        if (saved) clearActive(context);
        return saved;
    }

    public static synchronized void clearHistory(Context context) {
        new AtomicFile(new File(context.getFilesDir(), HISTORY_FILE)).delete();
    }

    private static String readFile(File file) {
        try {
            byte[] bytes = new AtomicFile(file).readFully();
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (FileNotFoundException e) {
            return "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private static boolean writeFile(File file, String value) {
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream output = null;
        try {
            output = atomic.startWrite();
            output.write(value.getBytes(StandardCharsets.UTF_8));
            atomic.finishWrite(output);
            return true;
        } catch (Exception ignored) {
            if (output != null) atomic.failWrite(output);
            return false;
        }
    }

    public static final class Recipient {
        public final String name;
        public final String phone;
        public String status;

        public Recipient(String name, String phone, String status) {
            this.name = name == null ? "" : name;
            this.phone = PhoneNormalizer.normalize(phone);
            this.status = status == null ? STATUS_PENDING : status;
        }

        JSONObject toJson() {
            JSONObject object = new JSONObject();
            try {
                object.put("name", name);
                object.put("phone", phone);
                object.put("status", status);
            } catch (JSONException ignored) {
            }
            return object;
        }

        static Recipient fromJson(JSONObject object) {
            return new Recipient(
                    object.optString("name"),
                    object.optString("phone"),
                    object.optString("status", STATUS_PENDING)
            );
        }
    }

    public static final class Campaign {
        public String id;
        public String title;
        public String message;
        public long createdAt;
        public long finishedAt;
        public boolean paused;
        public int currentIndex;
        public final List<Recipient> recipients = new ArrayList<>();

        public static Campaign create(String title, String message, List<ContactRepository.Item> contacts) {
            Campaign campaign = new Campaign();
            campaign.id = String.valueOf(System.currentTimeMillis());
            campaign.title = title == null || title.trim().isEmpty() ? "Рассылка" : title.trim();
            campaign.message = message == null ? "" : message;
            campaign.createdAt = System.currentTimeMillis();
            campaign.currentIndex = 0;
            campaign.paused = false;
            for (ContactRepository.Item item : contacts) {
                campaign.recipients.add(new Recipient(item.name, item.phone, STATUS_PENDING));
            }
            return campaign;
        }

        public Recipient current() {
            advanceIndex();
            if (currentIndex < 0 || currentIndex >= recipients.size()) return null;
            return recipients.get(currentIndex);
        }

        public void advanceIndex() {
            while (currentIndex < recipients.size()) {
                String status = recipients.get(currentIndex).status;
                if (STATUS_PENDING.equals(status) || STATUS_OPENED.equals(status)) return;
                currentIndex++;
            }
        }

        public int preparedCount() {
            int count = 0;
            for (Recipient r : recipients) if (STATUS_PREPARED.equals(r.status)) count++;
            return count;
        }

        public int skippedCount() {
            int count = 0;
            for (Recipient r : recipients) if (STATUS_SKIPPED.equals(r.status)) count++;
            return count;
        }

        public int processedCount() {
            return preparedCount() + skippedCount();
        }

        public int totalCount() {
            return recipients.size();
        }

        public boolean complete() {
            return current() == null;
        }

        JSONObject toJson() {
            JSONObject object = new JSONObject();
            JSONArray arr = new JSONArray();
            for (Recipient recipient : recipients) arr.put(recipient.toJson());
            try {
                object.put("id", id);
                object.put("title", title);
                object.put("message", message);
                object.put("created_at", createdAt);
                object.put("finished_at", finishedAt);
                object.put("paused", paused);
                object.put("current_index", currentIndex);
                object.put("recipients", arr);
            } catch (JSONException ignored) {
            }
            return object;
        }

        static Campaign fromJson(JSONObject object) {
            Campaign campaign = new Campaign();
            campaign.id = object.optString("id");
            campaign.title = object.optString("title", "Рассылка");
            campaign.message = object.optString("message");
            campaign.createdAt = object.optLong("created_at");
            campaign.finishedAt = object.optLong("finished_at");
            campaign.paused = object.optBoolean("paused", false);
            campaign.currentIndex = Math.max(0, object.optInt("current_index", 0));
            JSONArray arr = object.optJSONArray("recipients");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject recipient = arr.optJSONObject(i);
                    if (recipient != null) campaign.recipients.add(Recipient.fromJson(recipient));
                }
            }
            campaign.advanceIndex();
            return campaign;
        }
    }

    public static final class Summary {
        public String id;
        public String title;
        public long createdAt;
        public long finishedAt;
        public int total;
        public int prepared;
        public int skipped;
        public boolean cancelled;

        static Summary fromCampaign(Campaign campaign, boolean cancelled) {
            Summary summary = new Summary();
            summary.id = campaign.id;
            summary.title = campaign.title;
            summary.createdAt = campaign.createdAt;
            summary.finishedAt = campaign.finishedAt;
            summary.total = campaign.totalCount();
            summary.prepared = campaign.preparedCount();
            summary.skipped = campaign.skippedCount();
            summary.cancelled = cancelled;
            return summary;
        }

        JSONObject toJson() {
            JSONObject object = new JSONObject();
            try {
                object.put("id", id);
                object.put("title", title);
                object.put("created_at", createdAt);
                object.put("finished_at", finishedAt);
                object.put("total", total);
                object.put("prepared", prepared);
                object.put("skipped", skipped);
                object.put("cancelled", cancelled);
            } catch (JSONException ignored) {
            }
            return object;
        }

        static Summary fromJson(JSONObject object) {
            Summary summary = new Summary();
            summary.id = object.optString("id");
            summary.title = object.optString("title", "Рассылка");
            summary.createdAt = object.optLong("created_at");
            summary.finishedAt = object.optLong("finished_at");
            summary.total = object.optInt("total");
            summary.prepared = object.optInt("prepared");
            summary.skipped = object.optInt("skipped");
            summary.cancelled = object.optBoolean("cancelled");
            return summary;
        }
    }
}
