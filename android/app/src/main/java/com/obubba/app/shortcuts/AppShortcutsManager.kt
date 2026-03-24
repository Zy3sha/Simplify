package com.obubba.app.shortcuts

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import com.obubba.app.MainActivity
import com.obubba.app.R

/**
 * Manages Android App Shortcuts (long-press home icon actions)
 * and Google Assistant App Actions integration.
 */
object AppShortcutsManager {

    fun setupDynamicShortcuts(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return

        val shortcutManager = context.getSystemService(ShortcutManager::class.java) ?: return

        val logFeed = ShortcutInfo.Builder(context, "log_feed")
            .setShortLabel("Log Feed")
            .setLongLabel("Log a feed for baby")
            .setIcon(Icon.createWithResource(context, R.drawable.ic_feed))
            .setIntent(Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                putExtra("action", "log_feed")
            })
            .setRank(0)
            .build()

        val logSleep = ShortcutInfo.Builder(context, "log_sleep")
            .setShortLabel("Log Sleep")
            .setLongLabel("Log sleep or nap")
            .setIcon(Icon.createWithResource(context, R.drawable.ic_sleep))
            .setIntent(Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                putExtra("action", "log_sleep")
            })
            .setRank(1)
            .build()

        val logNappy = ShortcutInfo.Builder(context, "log_nappy")
            .setShortLabel("Log Nappy")
            .setLongLabel("Log a nappy change")
            .setIcon(Icon.createWithResource(context, R.drawable.ic_nappy))
            .setIntent(Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                putExtra("action", "log_nappy")
            })
            .setRank(2)
            .build()

        val startTimer = ShortcutInfo.Builder(context, "start_timer")
            .setShortLabel("Start Timer")
            .setLongLabel("Start a feed or sleep timer")
            .setIcon(Icon.createWithResource(context, R.drawable.ic_timer))
            .setIntent(Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                putExtra("action", "start_timer")
            })
            .setRank(3)
            .build()

        shortcutManager.dynamicShortcuts = listOf(logFeed, logSleep, logNappy, startTimer)
    }

    fun reportShortcutUsed(context: Context, shortcutId: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return
        val shortcutManager = context.getSystemService(ShortcutManager::class.java) ?: return
        shortcutManager.reportShortcutUsed(shortcutId)
    }
}
