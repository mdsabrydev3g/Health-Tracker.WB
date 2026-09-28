package com.healthtracker.app;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Alarm-health watchdog — the "zero silent failures" requirement (§1.7 / §9).
 *
 * A dose reminder that does not fire is worse than no reminder at all: the
 * caregiver believes the mother was prompted when she was not. Capacitor has no
 * API for exact-alarm or Doze state, so this plugin exposes it.
 *
 * The app MUST NOT silently fall back to inexact alarms. If exact alarms are
 * not granted it sends the user to the system screen instead.
 */
@CapacitorPlugin(name = "AlarmHealth")
public class AlarmHealthPlugin extends Plugin {

    /** Returns every flag the caregiver dashboard needs, in one call. */
    @PluginMethod
    public void getHealth(PluginCall call) {
        Context ctx = getContext();
        JSObject out = new JSObject();

        out.put("notifGranted", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        out.put("exactAlarmGranted", canScheduleExactAlarms(ctx));
        out.put("batteryExempt", isBatteryExempt(ctx));
        out.put("sdkInt", Build.VERSION.SDK_INT);

        call.resolve(out);
    }

    /**
     * Android 12 (API 31) added canScheduleExactAlarms(). Android 14 changed the
     * default to denied for most apps, so this must be checked — never assumed.
     */
    @PluginMethod
    public void canScheduleExactAlarms(PluginCall call) {
        JSObject out = new JSObject();
        out.put("granted", canScheduleExactAlarms(getContext()));
        call.resolve(out);
    }

    /** Opens the system screen where the user can grant exact alarms. */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /**
     * Opens the battery-optimization screen. Without the exemption, Doze can
     * delay a dose alarm by minutes or hours.
     */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** Opens this app's notification settings (used when POST_NOTIFICATIONS denied). */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            i.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    private boolean canScheduleExactAlarms(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            return am != null && am.canScheduleExactAlarms();
        }
        // Before API 31 exact alarms were implicit.
        return true;
    }

    private boolean isBatteryExempt(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        return true;
    }
}
