package com.obubba.app.plugins

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.obubba.app.widgets.OBubbaSummaryWidget

/**
 * Bridges widget data between the web app and Android widgets.
 * Writes data to SharedPreferences so widgets can read it.
 */
@CapacitorPlugin(name = "OBWidgetBridge")
class WidgetBridgePlugin : Plugin() {

    private fun getSharedPrefs(): SharedPreferences {
        return context.getSharedPreferences("obubba_widget_data", Context.MODE_PRIVATE)
    }

    @PluginMethod
    fun setData(call: PluginCall) {
        val json = call.getString("json") ?: run {
            call.reject("json is required")
            return
        }

        getSharedPrefs().edit().putString("widgetData", json).apply()

        // Trigger widget update
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val widgetComponent = ComponentName(context, OBubbaSummaryWidget::class.java)
        val widgetIds = appWidgetManager.getAppWidgetIds(widgetComponent)
        if (widgetIds.isNotEmpty()) {
            appWidgetManager.notifyAppWidgetViewDataChanged(widgetIds, android.R.id.list_container)
            OBubbaSummaryWidget.updateWidgets(context, appWidgetManager, widgetIds)
        }

        val ret = com.getcapacitor.JSObject()
        ret.put("saved", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun reloadAll(call: PluginCall) {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val widgetComponent = ComponentName(context, OBubbaSummaryWidget::class.java)
        val widgetIds = appWidgetManager.getAppWidgetIds(widgetComponent)
        if (widgetIds.isNotEmpty()) {
            OBubbaSummaryWidget.updateWidgets(context, appWidgetManager, widgetIds)
        }
        call.resolve()
    }
}
