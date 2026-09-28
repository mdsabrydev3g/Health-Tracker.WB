package com.healthtracker.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom plugin for the alarm-health watchdog (see AlarmHealthPlugin).
        registerPlugin(AlarmHealthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
