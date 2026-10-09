package ru.etagi.borisoglebsk.smscard;

public final class PhoneNormalizer {
    private PhoneNormalizer() {}

    public static String normalize(String number) {
        if (number == null) return "";
        String digits = number.replaceAll("[^0-9]", "");
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
            return "+7 " + n.substring(1, 4) + " " + n.substring(4, 7) + "-" + n.substring(7, 9) + "-" + n.substring(9);
        }
        return number == null ? "" : number.trim();
    }

    public static boolean usable(String number) {
        String n = normalize(number);
        return n.length() >= 10 && n.length() <= 15;
    }
}
