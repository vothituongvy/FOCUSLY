package com.focuslymobile

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

/** Cầu nối JS -> widget màn hình chính, và đọc hành động khi người dùng bấm widget */
class WidgetModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName(): String = NAME

  @ReactMethod
  fun update(data: ReadableMap) {
    val e = ctx.getSharedPreferences(FocuslyWidget.PREFS, Context.MODE_PRIVATE).edit()
    listOf("minutes", "minutesLabel", "cardsLine", "streakLine", "startLabel").forEach { k ->
      if (data.hasKey(k)) e.putString(k, data.getString(k))
    }
    if (data.hasKey("progress")) e.putInt("progress", data.getInt("progress"))
    e.apply()
    FocuslyWidget.refreshAll(ctx)
  }

  /** Hành động từ widget đã mở app (startFocus | review | open) – đọc xong thì xoá */
  @ReactMethod
  fun consumeAction(promise: Promise) {
    val intent = ctx.currentActivity?.intent
    val action = intent?.getStringExtra(FocuslyWidget.ACTION_EXTRA)
    intent?.removeExtra(FocuslyWidget.ACTION_EXTRA)
    promise.resolve(action)
  }

  companion object {
    const val NAME = "FocuslyWidget"
  }
}
