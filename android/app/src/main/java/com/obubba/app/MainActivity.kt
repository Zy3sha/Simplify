package com.obubba.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.obubba.app.plugins.WidgetBridgePlugin
import com.obubba.app.shortcuts.AppShortcutsManager

/**
 * Main Activity for OBubba Android app.
 * Registers native Capacitor plugins and handles deep link actions.
 */
class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Register custom Capacitor plugins
        registerPlugin(WidgetBridgePlugin::class.java)

        super.onCreate(savedInstanceState)

        // Set up app shortcuts
        AppShortcutsManager.setupDynamicShortcuts(this)

        // Handle shortcut/deep link actions
        handleAction(intent?.getStringExtra("action"))
    }

    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        handleAction(intent?.getStringExtra("action"))
    }

    private fun handleAction(action: String?) {
        if (action == null) return

        // Report shortcut usage for better ranking
        AppShortcutsManager.reportShortcutUsed(this, action)

        // Pass action to WebView via JavaScript
        bridge?.eval("window.dispatchEvent(new CustomEvent('nativeAction', { detail: { action: '$action' } }))")
    }
}
