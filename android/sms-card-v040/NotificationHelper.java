package ru.etagi.borisoglebsk.smscard;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.os.Build;

public final class NotificationHelper {
    public static final String CHANNEL_ID = "after_call_cards_popup_v2";
    public static final int NOTIFICATION_ID = 2209;
    private static final int TEST_NOTIFICATION_ID = 2210;

    private NotificationHelper() {}

    public static void ensureChannel(Context c) {
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Визитка после звонка — всплывающее",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Всплывающее предложение отправить SMS-визитку после завершения разговора");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 120, 80, 120});
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    public static void showAfterCall(Context c, String number, String callType) {
        if (!canNotify(c)) return;
        ensureChannel(c);

        NotificationManager manager = c.getSystemService(NotificationManager.class);
        if (manager == null) return;

        int requestBase = 1000 + Math.abs((number == null ? 0 : number.hashCode()) % 5000);

        Intent send = new Intent(c, SmsComposeActivity.class)
                .putExtra("number", number)
                .putExtra("call_type", callType)
                .putExtra("auto_template", true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent sendPi = PendingIntent.getActivity(
                c, requestBase, send,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent dismiss = new Intent(c, DismissNotificationReceiver.class);
        PendingIntent dismissPi = PendingIntent.getBroadcast(
                c, requestBase + 1, dismiss,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String kind = switch (callType) {
            case CallSessionStore.TYPE_OUTGOING -> "исходящий звонок";
            case CallSessionStore.TYPE_MISSED -> "пропущенный звонок";
            default -> "входящий звонок";
        };

        Notification notification = baseBuilder(c)
                .setContentTitle("Отправить визитку?")
                .setContentText(formatNumber(number) + " • " + kind)
                .setStyle(new Notification.BigTextStyle().bigText(
                        "Разговор завершён. Нажмите, чтобы открыть готовую SMS-визитку для " + formatNumber(number) + "."
                ))
                .setContentIntent(sendPi)
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(c, R.drawable.ic_notification),
                        "Отправить SMS",
                        sendPi
                ).build())
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(c, R.drawable.ic_notification),
                        "Не сейчас",
                        dismissPi
                ).build())
                .setTimeoutAfter(10 * 60 * 1000L)
                .build();

        manager.notify(NOTIFICATION_ID, notification);
    }

    public static boolean showTest(Context c) {
        if (!canNotify(c)) return false;
        ensureChannel(c);

        NotificationManager manager = c.getSystemService(NotificationManager.class);
        if (manager == null) return false;

        Intent open = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(
                c, 9910, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = baseBuilder(c)
                .setContentTitle("Тест: всплывающее уведомление")
                .setContentText("Если этот баннер появился поверх экрана — уведомления настроены правильно.")
                .setStyle(new Notification.BigTextStyle().bigText(
                        "Если этот баннер появился поверх экрана — уведомления настроены правильно. Если запись появилась только в шторке, откройте настройки канала и разрешите всплывающие уведомления / баннеры."
                ))
                .setContentIntent(openPi)
                .setTimeoutAfter(30_000L)
                .build();

        manager.notify(TEST_NOTIFICATION_ID, notification);
        return true;
    }

    private static Notification.Builder baseBuilder(Context c) {
        return new Notification.Builder(c, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_MAX)
                .setDefaults(Notification.DEFAULT_ALL)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_REMINDER);
    }

    private static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        return manager != null && manager.areNotificationsEnabled();
    }

    public static void dismiss(Context c) {
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
    }

    private static String formatNumber(String n) {
        return n == null || n.trim().isEmpty() ? "номер не определён" : n;
    }
}
