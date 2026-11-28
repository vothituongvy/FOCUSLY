package com.focuslymobile

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * FOCUSLY – Hiện thông báo trên thanh thông báo khi app ĐANG MỞ.
 * (Khi app mở, Firebase không tự hiện thông báo mà giao cho app; module này hiện giúp, giống Messenger.)
 * Chạm vào thông báo -> mở app kèm đường dẫn để JS chuyển tới đúng màn hình.
 */
class NotifyModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName(): String = NAME

  @ReactMethod
  fun show(title: String, body: String, channelId: String, link: String?, tag: String?) {
    val intent = Intent(ctx, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      if (!link.isNullOrEmpty()) putExtra(LINK_EXTRA, link)
    }
    val id = (tag ?: "$title$body").hashCode()
    val pi = PendingIntent.getActivity(ctx, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val n = NotificationCompat.Builder(ctx, channelId)
      .setSmallIcon(R.drawable.ic_stat_focusly)
      .setColor(0xFFFFCF2E.toInt())
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setDefaults(NotificationCompat.DEFAULT_ALL)
      .setAutoCancel(true)
      .setContentIntent(pi)
      .build()
    try {
      NotificationManagerCompat.from(ctx).notify(tag, id, n)
    } catch (_: SecurityException) {
      // người dùng tắt quyền thông báo
    }
  }

  /** Đường dẫn từ thông báo vừa được chạm (đọc xong thì xoá) */
  @ReactMethod
  fun consumeLink(promise: Promise) {
    val intent = ctx.currentActivity?.intent
    val link = intent?.getStringExtra(LINK_EXTRA)
    intent?.removeExtra(LINK_EXTRA)
    promise.resolve(link)
  }

  companion object {
    const val NAME = "FocuslyNotify"
    const val LINK_EXTRA = "focuslyLink"
  }
}
