package ru.etagi.borisoglebsk.smscard;

import android.Manifest;
import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import java.util.Locale;

public final class DeviceDiagnostics {
    private DeviceDiagnostics() {}

    public static boolean phonePermission(Context c) {
        return c.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean contactsPermission(Context c) {
        return c.checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean notificationsPermission(Context c) {
        boolean runtime = Build.VERSION.SDK_INT < 33
                || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        return runtime && manager != null && manager.areNotificationsEnabled();
    }

    public static boolean callRoleAvailable(Context c) {
        RoleManager rm = c.getSystemService(RoleManager.class);
        return rm != null && rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING);
    }

    public static boolean callRoleHeld(Context c) {
        RoleManager rm = c.getSystemService(RoleManager.class);
        return rm != null
                && rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)
                && rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING);
    }

    public static int notificationImportance(Context c) {
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        if (manager == null) return NotificationManager.IMPORTANCE_NONE;
        NotificationHelper.ensureChannel(c);
        NotificationChannel channel = manager.getNotificationChannel(NotificationHelper.CHANNEL_ID);
        return channel == null ? NotificationManager.IMPORTANCE_NONE : channel.getImportance();
    }

    public static String notificationImportanceLabel(Context c) {
        int value = notificationImportance(c);
        if (value >= NotificationManager.IMPORTANCE_HIGH) return "Высокая — всплытие разрешено каналом";
        if (value == NotificationManager.IMPORTANCE_DEFAULT) return "Обычная — всплытие может не показываться";
        if (value == NotificationManager.IMPORTANCE_LOW || value == NotificationManager.IMPORTANCE_MIN) return "Низкая — уведомление обычно только в шторке";
        return "Выключена";
    }

    public static boolean backgroundRestricted(Context c) {
        ActivityManager manager = c.getSystemService(ActivityManager.class);
        return manager != null && manager.isBackgroundRestricted();
    }

    public static boolean ignoringBatteryOptimizations(Context c) {
        PowerManager pm = c.getSystemService(PowerManager.class);
        return pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName());
    }

    public static String batteryOptimizationLabel(Context c) {
        return ignoringBatteryOptimizations(c)
                ? "Оптимизация батареи отключена для приложения"
                : "Используется обычная системная оптимизация батареи";
    }

    public static String deviceLabel() {
        return clean(Build.MANUFACTURER) + " " + clean(Build.MODEL) + " • Android " + Build.VERSION.RELEASE;
    }

    public static String manufacturerAdvice() {
        String m = clean(Build.MANUFACTURER).toLowerCase(Locale.ROOT);
        if (m.contains("xiaomi") || m.contains("redmi") || m.contains("poco")) {
            return "Для Xiaomi / Redmi / POCO дополнительно проверьте автозапуск, работу в фоне и всплывающие уведомления. Названия пунктов отличаются между MIUI и HyperOS.";
        }
        if (m.contains("vivo") || m.contains("iqoo")) {
            return "Для vivo / iQOO дополнительно проверьте автозапуск, фоновую работу и разрешение всплывающих уведомлений. В OriginOS названия пунктов могут отличаться по версии.";
        }
        if (m.contains("oppo") || m.contains("realme") || m.contains("oneplus")) {
            return "Для OPPO / realme / OnePlus дополнительно проверьте автозапуск, фоновую активность и баннеры уведомлений.";
        }
        if (m.contains("huawei") || m.contains("honor")) {
            return "Для Huawei / Honor дополнительно проверьте «Запуск приложений» / автозапуск, работу в фоне и баннеры уведомлений.";
        }
        if (m.contains("samsung")) {
            return "Для Samsung проверьте всплывающие уведомления и убедитесь, что приложение не помещено в список глубоко спящих.";
        }
        return "Если тестовое уведомление остаётся только в шторке, включите баннеры/всплывающие уведомления и проверьте ограничения фоновой работы.";
    }

    public static void openNotificationSettings(Context c) {
        Intent intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, NotificationHelper.CHANNEL_ID)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        safeStart(c, intent, appDetailsIntent(c));
    }

    public static void openBatterySettings(Context c) {
        Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        safeStart(c, intent, appDetailsIntent(c));
    }

    public static void openAppSettings(Context c) {
        safeStart(c, appDetailsIntent(c), new Intent(Settings.ACTION_SETTINGS));
    }

    private static Intent appDetailsIntent(Context c) {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:" + c.getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    private static void safeStart(Context c, Intent first, Intent fallback) {
        try {
            c.startActivity(first);
        } catch (Exception ignored) {
            try {
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(fallback);
            } catch (Exception ignoredAgain) {
            }
        }
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
