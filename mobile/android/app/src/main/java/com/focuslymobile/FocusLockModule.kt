package com.focuslymobile

import android.app.ActivityManager
import android.content.Context
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * FOCUSLY – Khoá màn hình học (Android "Ghim ứng dụng" / Lock Task).
 * Khi ghim, người dùng không thể chuyển sang app khác hay về màn hình chính
 * cho đến khi phiên kết thúc (hoặc tự bỏ ghim bằng thao tác hệ thống).
 */
class FocusLockModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  override fun getName(): String = NAME

  @ReactMethod
  fun start(promise: Promise) {
    val activity = ctx.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    UiThreadUtil.runOnUiThread {
      try {
        activity.startLockTask()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    val activity = ctx.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    UiThreadUtil.runOnUiThread {
      try {
        activity.stopLockTask()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun isLocked(promise: Promise) {
    val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    promise.resolve(am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE)
  }

  /**
   * Tải lại phần giao diện (JS) của app – dùng khi đổi ngôn ngữ để MỌI nhãn đổi theo ngay,
   * kể cả các nhãn được tạo sẵn lúc mở app. Dữ liệu và đăng nhập vẫn giữ nguyên.
   */
  @ReactMethod
  fun reload(promise: Promise) {
    val app = ctx.applicationContext as? ReactApplication
    val host = app?.reactHost
    if (host == null) {
      promise.resolve(false)
      return
    }
    promise.resolve(true)
    UiThreadUtil.runOnUiThread { host.reload("language changed") }
  }

  companion object {
    const val NAME = "FocusLock"
  }
}
