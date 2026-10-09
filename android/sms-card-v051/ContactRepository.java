package ru.etagi.borisoglebsk.smscard;

import android.content.Context;
import android.database.Cursor;
import android.provider.ContactsContract;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;

public final class ContactRepository {
    private ContactRepository() {}

    public static List<Item> load(Context context) {
        LinkedHashMap<String, Item> byPhone = new LinkedHashMap<>();

        String[] projection = new String[]{
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
                ContactsContract.CommonDataKinds.Phone.TYPE
        };

        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(
                    ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    projection,
                    null,
                    null,
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY + " COLLATE LOCALIZED ASC"
            );
            if (cursor == null) return new ArrayList<>();

            int nameColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY);
            int phoneColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
            int typeColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.TYPE);

            while (cursor.moveToNext()) {
                String rawPhone = phoneColumn >= 0 ? cursor.getString(phoneColumn) : "";
                String normalized = PhoneNormalizer.normalize(rawPhone);
                if (!PhoneNormalizer.usable(normalized)) continue;

                String name = nameColumn >= 0 ? cursor.getString(nameColumn) : "";
                if (name == null || name.trim().isEmpty()) name = PhoneNormalizer.display(normalized);

                int type = typeColumn >= 0 ? cursor.getInt(typeColumn) : ContactsContract.CommonDataKinds.Phone.TYPE_OTHER;
                boolean mobile = isMobileType(type) || PhoneNormalizer.looksLikeRussianMobile(normalized);

                Item existing = byPhone.get(normalized);
                if (existing == null || (!existing.mobile && mobile)) {
                    byPhone.put(normalized, new Item(name.trim(), normalized, mobile));
                }
            }
        } catch (RuntimeException ignored) {
            return new ArrayList<>(byPhone.values());
        } finally {
            if (cursor != null) cursor.close();
        }

        return new ArrayList<>(byPhone.values());
    }

    private static boolean isMobileType(int type) {
        return type == ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE
                || type == ContactsContract.CommonDataKinds.Phone.TYPE_WORK_MOBILE
                || type == ContactsContract.CommonDataKinds.Phone.TYPE_MMS;
    }

    public static final class Item {
        public final String name;
        public final String phone;
        public final boolean mobile;

        public Item(String name, String phone) {
            this(name, phone, PhoneNormalizer.looksLikeRussianMobile(phone));
        }

        public Item(String name, String phone, boolean mobile) {
            this.name = name == null ? "" : name;
            this.phone = PhoneNormalizer.normalize(phone);
            this.mobile = mobile;
        }

        public boolean matches(String query) {
            String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
            if (q.isEmpty()) return true;
            String digits = q.replaceAll("[^0-9]", "");
            return name.toLowerCase(Locale.ROOT).contains(q)
                    || (!digits.isEmpty() && phone.contains(digits))
                    || PhoneNormalizer.display(phone).toLowerCase(Locale.ROOT).contains(q);
        }
    }
}
