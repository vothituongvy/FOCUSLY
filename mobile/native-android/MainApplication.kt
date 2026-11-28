package com.focuslymobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(FocusLockPackage()) // FOCUSLY: khoá màn hình khi học
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannels()
    loadReactNative(this)
  }

  /**
   * Kênh thông báo mức CAO: hiện banner trên màn hình, có âm thanh/rung và nằm trên thanh thông báo
   * kể cả khi app đóng (giống Messenger). Thông báo đẩy từ máy chủ dùng đúng các kênh này.
   */
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java) ?: return
    nm.createNotificationChannel(
      NotificationChannel("focusly-default", "Nhắc học & hoạt động", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Nhắc lịch học, nhiệm vụ, ôn thẻ, bạn bè, lớp học"
        enableVibration(true)
      },
    )
    nm.createNotificationChannel(
      NotificationChannel("focusly-chat", "Tin nhắn", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Tin nhắn từ bạn bè và nhóm học"
        enableVibration(true)
      },
    )
  }
}
