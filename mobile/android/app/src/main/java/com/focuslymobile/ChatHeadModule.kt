package com.focuslymobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Cầu nối JS <-> bong bóng chat nổi ngoài app (ChatHeads) */
class ChatHeadModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName(): String = NAME

  @ReactMethod
  fun show(chatId: String, name: String, avatarUrl: String?, link: String) = ChatHeads.show(ctx, chatId, name, avatarUrl, link)

  @ReactMethod
  fun hide() = ChatHeads.hide(ctx)

  /** { enabled, permission } */
  @ReactMethod
  fun status(promise: Promise) {
    val m = com.facebook.react.bridge.Arguments.createMap()
    m.putBoolean("enabled", ChatHeads.isEnabled(ctx))
    m.putBoolean("permission", ChatHeads.canDraw(ctx))
    promise.resolve(m)
  }

  @ReactMethod
  fun setEnabled(on: Boolean) = ChatHeads.setEnabled(ctx, on)

  /** Mở trang cài đặt "Hiển thị trên ứng dụng khác" của FOCUSLY */
  @ReactMethod
  fun openPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val i = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try { ctx.startActivity(i) } catch (_: Exception) {
      try { ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
    }
  }

  companion object {
    const val NAME = "FocuslyChatHead"
  }
}
