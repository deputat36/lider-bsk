package ru.etagi.borisoglebsk.smscard;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class ConfigBackup {
    private static final String FORMAT = "etagi_sms_vizitka_config";
    private static final int VERSION = 1;

    private ConfigBackup() {}

    public static String exportJson(Context c) throws JSONException {
        JSONObject root = new JSONObject();
        root.put("format", FORMAT);
        root.put("version", VERSION);

        JSONObject profile = new JSONObject();
        profile.put("agent_name", AppPrefs.agentName(c));
        profile.put("position", AppPrefs.position(c));
        profile.put("agent_phone", AppPrefs.phone(c));
        profile.put("vk", AppPrefs.vk(c));
        profile.put("max_messenger", AppPrefs.maxMessenger(c));
        profile.put("whatsapp", AppPrefs.whatsapp(c));
        profile.put("telegram", AppPrefs.telegram(c));
        profile.put("email", AppPrefs.email(c));
        profile.put("website", AppPrefs.website(c));
        profile.put("card_link", AppPrefs.cardLink(c));
        root.put("profile", profile);

        JSONObject automation = new JSONObject();
        automation.put("after_incoming", AppPrefs.afterIncoming(c));
        automation.put("after_outgoing", AppPrefs.afterOutgoing(c));
        automation.put("after_missed", AppPrefs.afterMissed(c));
        automation.put("work_hours", AppPrefs.workHoursOnly(c));
        automation.put("repeat_days", AppPrefs.repeatDays(c));
        root.put("automation", automation);

        JSONArray templates = new JSONArray();
        for (int i = 0; i < SmsTemplates.NAMES.length; i++) {
            JSONObject item = new JSONObject();
            item.put("index", i);
            item.put("name", SmsTemplates.NAMES[i]);
            item.put("text", AppPrefs.smsTemplate(c, i));
            templates.put(item);
        }
        root.put("templates", templates);

        return root.toString(2);
    }

    public static void importJson(Context c, String json) throws JSONException {
        JSONObject root = new JSONObject(json);
        if (!FORMAT.equals(root.optString("format"))) {
            throw new JSONException("Неверный формат файла настроек");
        }
        if (root.optInt("version", 0) < 1) {
            throw new JSONException("Неподдерживаемая версия файла настроек");
        }

        JSONObject profile = root.optJSONObject("profile");
        if (profile != null) {
            AppPrefs.saveProfile(c,
                    profile.optString("agent_name", AppPrefs.agentName(c)),
                    profile.optString("position", AppPrefs.position(c)),
                    profile.optString("agent_phone", AppPrefs.phone(c)),
                    profile.optString("vk", AppPrefs.vk(c)),
                    profile.optString("max_messenger", AppPrefs.maxMessenger(c)),
                    profile.optString("whatsapp", AppPrefs.whatsapp(c)),
                    profile.optString("telegram", AppPrefs.telegram(c)),
                    profile.optString("email", AppPrefs.email(c)),
                    profile.optString("website", AppPrefs.website(c)),
                    profile.optString("card_link", AppPrefs.cardLink(c)));
        }

        JSONObject automation = root.optJSONObject("automation");
        if (automation != null) {
            AppPrefs.saveAutomation(c,
                    automation.optBoolean("after_incoming", AppPrefs.afterIncoming(c)),
                    automation.optBoolean("after_outgoing", AppPrefs.afterOutgoing(c)),
                    automation.optBoolean("after_missed", AppPrefs.afterMissed(c)),
                    automation.optBoolean("work_hours", AppPrefs.workHoursOnly(c)),
                    sanitizeRepeatDays(automation.optInt("repeat_days", AppPrefs.repeatDays(c))));
        }

        JSONArray templates = root.optJSONArray("templates");
        if (templates != null) {
            for (int i = 0; i < templates.length(); i++) {
                JSONObject item = templates.optJSONObject(i);
                if (item == null) continue;
                int index = item.optInt("index", -1);
                if (index >= 0 && index < SmsTemplates.NAMES.length && item.has("text")) {
                    AppPrefs.saveSmsTemplate(c, index, item.optString("text", ""));
                }
            }
        }
    }

    private static int sanitizeRepeatDays(int days) {
        return days == 0 || days == 1 || days == 7 || days == 30 || days == 90 ? days : 30;
    }
}
