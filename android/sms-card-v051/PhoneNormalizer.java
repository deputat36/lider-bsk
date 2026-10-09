package ru.etagi.borisoglebsk.smscard;

import android.telephony.PhoneNumberUtils;

public final class PhoneNormalizer {
    private PhoneNormalizer() {}

    public static String normalize(String number) {
        if (number == null) return "";

        String network = null;
        try {
            network = PhoneNumberUtils.extractNetworkPortion(number);
        } catch (Throwable ignored) {
        }
        if (network == null || network.trim().isEmpty()) {
            network = manualNetworkPart(number);
        }

        String normalized = null;
        try {
            normalized = PhoneNumberUtils.normalizeNumber(network);
        } catch (Throwable ignored) {
        }
        if (normalized == null || normalized.isEmpty()) normalized = network;

        String digits = normalized.replaceAll("[^0-9]", "");
        if (digits.length() == 11 && digits.startsWith("8")) {
            return "7" + digits.substring(1);
        }
        if (digits.length() == 10 && digits.startsWith("9")) {
            return "7" + digits;
        }
        return digits;
    }

    public static String display(String number) {
        String n = normalize(number);
        if (n.length() == 11 && n.startsWith("7")) {
            return "+7 " + n.substring(1, 4) + " " + n.substring(4, 7)
                    + "-" + n.substring(7, 9) + "-" + n.substring(9);
        }
        return number == null ? "" : number.trim();
    }

    public static boolean usable(String number) {
        String n = normalize(number);
        return n.length() >= 10 && n.length() <= 15;
    }

    public static boolean looksLikeRussianMobile(String number) {
        String n = normalize(number);
        return n.length() == 11 && n.startsWith("79");
    }

    private static String manualNetworkPart(String source) {
        String value = source == null ? "" : source.trim();
        int cut = value.length();
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch == ',' || ch == ';' || ch == 'p' || ch == 'P' || ch == 'w' || ch == 'W') {
                cut = i;
                break;
            }
        }
        return value.substring(0, cut);
    }
}
