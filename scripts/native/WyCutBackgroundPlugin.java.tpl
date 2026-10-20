package __PACKAGE__;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge: WyCutBackground.start / update / stop (see lib/native/background.ts). */
@CapacitorPlugin(name = "WyCutBackground")
public class WyCutBackgroundPlugin extends Plugin {
    private Intent intentFor(String title, String text) {
        Intent intent = new Intent(getContext(), WyCutForegroundService.class);
        if (title != null) intent.putExtra(WyCutForegroundService.EXTRA_TITLE, title);
        if (text != null) intent.putExtra(WyCutForegroundService.EXTRA_TEXT, text);
        return intent;
    }

    @PluginMethod public void start(PluginCall call) {
        try {
            Context context = getContext();
            if (Build.VERSION.SDK_INT >= 33 && getActivity() != null && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7001);
            }
            ContextCompat.startForegroundService(context, intentFor(call.getString("title", "WyCut is working"), call.getString("text", "Working…")));
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage() != null ? e.getMessage() : "Could not start the background service."); }
    }

    @PluginMethod public void update(PluginCall call) {
        try { ContextCompat.startForegroundService(getContext(), intentFor("WyCut is working", call.getString("text", "Working…"))); call.resolve(); }
        catch (Exception e) { call.reject(e.getMessage() != null ? e.getMessage() : "Could not update the notification."); }
    }

    @PluginMethod public void stop(PluginCall call) {
        try { getContext().stopService(new Intent(getContext(), WyCutForegroundService.class)); call.resolve(); }
        catch (Exception e) { call.reject(e.getMessage() != null ? e.getMessage() : "Could not stop the background service."); }
    }
}
