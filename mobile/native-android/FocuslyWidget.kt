package com.focuslymobile

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * FOCUSLY – Widget màn hình chính: phút học hôm nay, số thẻ cần ôn, chuỗi ngày,
 * nút bắt đầu phiên 25 phút. Dữ liệu do app ghi vào SharedPreferences (WidgetModule).
 */
class FocuslyWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { render(context, manager, it) }
  }

  companion object {
    const val PREFS = "focusly_widget"
    const val ACTION_EXTRA = "focuslyWidgetAction"

    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      manager.getAppWidgetIds(ComponentName(context, FocuslyWidget::class.java)).forEach { render(context, manager, it) }
    }

    private fun launch(context: Context, action: String, code: Int): PendingIntent {
      val intent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(ACTION_EXTRA, action)
      }
      return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun render(context: Context, manager: AppWidgetManager, id: Int) {
      val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val views = RemoteViews(context.packageName, R.layout.focusly_widget)
      views.setTextViewText(R.id.widget_minutes, p.getString("minutes", "0") ?: "0")
      views.setTextViewText(R.id.widget_minutes_label, p.getString("minutesLabel", "phút hôm nay") ?: "")
      views.setTextViewText(R.id.widget_cards, p.getString("cardsLine", "Mở app để đồng bộ") ?: "")
      views.setTextViewText(R.id.widget_streak, p.getString("streakLine", "") ?: "")
      views.setTextViewText(R.id.widget_start, p.getString("startLabel", "▶ Bắt đầu 25 phút") ?: "")
      views.setInt(R.id.widget_progress, "setProgress", p.getInt("progress", 0))
      views.setOnClickPendingIntent(R.id.widget_start, launch(context, "startFocus", 1))
      views.setOnClickPendingIntent(R.id.widget_cards, launch(context, "review", 2))
      views.setOnClickPendingIntent(R.id.widget_root, launch(context, "open", 3))
      manager.updateAppWidget(id, views)
    }
  }
}
