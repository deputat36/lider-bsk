package ru.etagi.borisoglebsk.smscard;

import android.telephony.SmsMessage;

public final class SmsLength {
    private SmsLength() {}

    public static Info calculate(String message) {
        String text = message == null ? "" : message;
        if (text.isEmpty()) return new Info(0, 0, "—");

        int[] result = SmsMessage.calculateLength(text, false);
        int segments = result != null && result.length > 0 ? result[0] : 0;
        int codeUnitSize = result != null && result.length > 3 ? result[3] : 0;
        String encoding = codeUnitSize == SmsMessage.ENCODING_7BIT ? "GSM-7" : "Unicode";
        return new Info(text.length(), segments, encoding);
    }

    public static final class Info {
        public final int characters;
        public final int segments;
        public final String encoding;

        Info(int characters, int segments, String encoding) {
            this.characters = characters;
            this.segments = segments;
            this.encoding = encoding;
        }

        public String label() {
            return characters + " символов • " + encoding + " • примерно " + segments + " SMS";
        }
    }
}
