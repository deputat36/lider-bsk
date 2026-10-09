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
                ContactsContract.CommonDataKinds.Phone.NUMBER
        };

        try (Cursor cursor = context.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY + " COLLATE LOCALIZED ASC"
        )) {
            if (cursor == null) return new ArrayList<>();

            int nameColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY);
            int phoneColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);

            while (cursor.moveToNext()) {
                String rawPhone = phoneColumn >= 0 ? cursor.getString(phoneColumn) : "";
                String normalized = PhoneNormalizer.normalize(rawPhone);
                if (!PhoneNormalizer.usable(normalized) || byPhone.containsKey(normalized)) continue;

                String name = nameColumn >= 0 ? cursor.getString(nameColumn) : "";
                if (name == null || name.trim().isEmpty()) name = PhoneNormalizer.display(normalized);
                byPhone.put(normalized, new Item(name.trim(), normalized));
            }
        } catch (SecurityException ignored) {
            return new ArrayList<>();
        }

        return new ArrayList<>(byPhone.values());
    }

    public static final class Item {
        public final String name;
        public final String phone;

        public Item(String name, String phone) {
            this.name = name == null ? "" : name;
            this.phone = PhoneNormalizer.normalize(phone);
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
