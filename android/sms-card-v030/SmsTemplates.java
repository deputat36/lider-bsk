package ru.etagi.borisoglebsk.smscard;

import android.content.Context;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class SmsTemplates {
    public static final String[] NAMES = {
            "Универсальная визитка",
            "После первого звонка",
            "После показа",
            "Не дозвонился",
            "Спасибо за обращение"
    };

    public static final String[] VARIABLE_LABELS = {
            "{agent_name} — имя специалиста",
            "{phone} — телефон специалиста",
            "{position} — должность",
            "{company} — компания",
            "{office} — офис / город",
            "{vk} — VK",
            "{max} — MAX",
            "{telegram} — Telegram",
            "{whatsapp} — WhatsApp",
            "{email} — Email",
            "{website} — сайт",
            "{card_url} — ссылка на визитку",
            "{contacts} — все заполненные каналы связи",
            "{client_name} — имя клиента, если введено вручную"
    };

    public static final String[] VARIABLE_TOKENS = {
            "{agent_name}", "{phone}", "{position}", "{company}", "{office}",
            "{vk}", "{max}", "{telegram}", "{whatsapp}", "{email}",
            "{website}", "{card_url}", "{contacts}", "{client_name}"
    };

    public static final int UNIVERSAL = 0;
    public static final int FIRST_CALL = 1;
    public static final int AFTER_SHOWING = 2;
    public static final int NO_ANSWER = 3;
    public static final int THANKS = 4;

    private SmsTemplates() {}

    public static String build(Context c, int template, String clientName) {
        return render(c, AppPrefs.smsTemplate(c, template), clientName);
    }

    public static String render(Context c, String source, String clientName) {
        if (source == null) return "";

        Map<String, String> values = variables(c, clientName);
        String normalized = source.replace("\r\n", "\n").replace('\r', '\n');
        String[] lines = normalized.split("\n", -1);
        StringBuilder out = new StringBuilder();

        for (String line : lines) {
            boolean removeLine = false;
            String rendered = line;

            for (Map.Entry<String, String> entry : values.entrySet()) {
                String token = entry.getKey();
                if (!rendered.contains(token)) continue;

                String value = clean(entry.getValue());
                if (value.isEmpty()) {
                    removeLine = true;
                    break;
                }
                rendered = rendered.replace(token, value);
            }

            if (!removeLine) {
                if (out.length() > 0) out.append('\n');
                out.append(rendered);
            }
        }

        String result = out.toString().replaceAll("\\n{3,}", "\n\n");
        return result.trim();
    }

    public static String defaultTemplate(int template) {
        switch (template) {
            case FIRST_CALL:
                return "Добрый день! Спасибо за разговор. Как и договорились, отправляю свои контакты.\n\n"
                        + "{agent_name}\n{position}\nКомпания «{company}» | {office}\nТел.: {phone}\nВизитка: {card_url}\n\n"
                        + "Сохраните мой номер — буду на связи по вопросам недвижимости.";
            case AFTER_SHOWING:
                return "Добрый день! Спасибо за встречу и просмотр объекта. Если появятся вопросы или захотите посмотреть другие варианты — я на связи.\n\n"
                        + "{agent_name}\n{position}\nТел.: {phone}";
            case NO_ANSWER:
                return "Добрый день! Пытался связаться с вами по вопросу недвижимости. Когда будет удобно — перезвоните или ответьте сообщением.\n\n"
                        + "{agent_name}\n{position}\nТел.: {phone}";
            case THANKS:
                return "Добрый день! Спасибо за обращение в компанию «{company}». Отправляю свои контакты — можете обращаться по вопросам недвижимости.\n\n"
                        + "{agent_name}\n{position}\nТел.: {phone}\nВизитка: {card_url}";
            case UNIVERSAL:
            default:
                return "Добрый день! Отправляю свои контакты.\n\n"
                        + "{agent_name}\n{position}\nКомпания «{company}» | {office}\nТел.: {phone}\nВизитка: {card_url}\n\n"
                        + "Сохраните мой номер — буду рад помочь по вопросам недвижимости.";
        }
    }

    public static String buildFullCard(Context c) {
        StringBuilder s = new StringBuilder();
        appendLine(s, clean(AppPrefs.agentName(c)));
        appendLine(s, clean(AppPrefs.position(c)));
        appendLine(s, "Компания «Этажи» | Борисоглебск");

        String phone = clean(AppPrefs.phone(c));
        if (!phone.isEmpty()) appendLine(s, "Тел.: " + phone);

        List<String> channels = allChannels(c);
        for (String channel : channels) appendLine(s, channel);

        String cardLink = ContactFormatter.website(AppPrefs.cardLink(c));
        if (!cardLink.isEmpty()) appendLine(s, "Визитка: " + cardLink);

        return trimTrailingNewline(s.toString());
    }

    public static int automaticTemplate(String callType) {
        if (CallSessionStore.TYPE_MISSED.equals(callType)) return NO_ANSWER;
        if (CallSessionStore.TYPE_OUTGOING.equals(callType)) return FIRST_CALL;
        return THANKS;
    }

    private static Map<String, String> variables(Context c, String clientName) {
        LinkedHashMap<String, String> result = new LinkedHashMap<>();
        result.put("{agent_name}", clean(AppPrefs.agentName(c)));
        result.put("{phone}", clean(AppPrefs.phone(c)));
        result.put("{position}", clean(AppPrefs.position(c)));
        result.put("{company}", "Этажи");
        result.put("{office}", "Борисоглебск");
        result.put("{vk}", ContactFormatter.vk(AppPrefs.vk(c)));
        result.put("{max}", ContactFormatter.max(AppPrefs.maxMessenger(c)));
        result.put("{telegram}", ContactFormatter.telegram(AppPrefs.telegram(c)));
        result.put("{whatsapp}", ContactFormatter.whatsapp(AppPrefs.whatsapp(c)));
        result.put("{email}", clean(AppPrefs.email(c)));
        result.put("{website}", ContactFormatter.website(AppPrefs.website(c)));
        result.put("{card_url}", ContactFormatter.website(AppPrefs.cardLink(c)));
        result.put("{contacts}", contactsBlock(c));
        result.put("{client_name}", clean(clientName));
        return result;
    }

    private static String contactsBlock(Context c) {
        StringBuilder s = new StringBuilder();
        for (String channel : allChannels(c)) appendLine(s, channel);
        String cardLink = ContactFormatter.website(AppPrefs.cardLink(c));
        if (!cardLink.isEmpty()) appendLine(s, "Визитка: " + cardLink);
        return trimTrailingNewline(s.toString());
    }

    private static List<String> allChannels(Context c) {
        ArrayList<String> result = new ArrayList<>();

        String vk = ContactFormatter.vk(AppPrefs.vk(c));
        if (!vk.isEmpty()) result.add("VK: " + vk);

        String max = ContactFormatter.max(AppPrefs.maxMessenger(c));
        if (!max.isEmpty()) result.add("MAX: " + max);

        String telegram = ContactFormatter.telegram(AppPrefs.telegram(c));
        if (!telegram.isEmpty()) result.add("Telegram: " + telegram);

        String whatsapp = ContactFormatter.whatsapp(AppPrefs.whatsapp(c));
        if (!whatsapp.isEmpty()) result.add("WhatsApp: " + whatsapp);

        String email = clean(AppPrefs.email(c));
        if (!email.isEmpty()) result.add("Email: " + email);

        String website = ContactFormatter.website(AppPrefs.website(c));
        if (!website.isEmpty()) result.add("Сайт: " + website);

        return result;
    }

    private static void appendLine(StringBuilder s, String value) {
        if (value == null || value.trim().isEmpty()) return;
        if (s.length() > 0) s.append('\n');
        s.append(value.trim());
    }

    private static String trimTrailingNewline(String value) {
        return value == null ? "" : value.trim();
    }

    private static String clean(String s) {
        return s == null ? "" : s.trim();
    }
}
