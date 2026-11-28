package com.focuslymobile

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * FOCUSLY – Lưu ảnh tin nhắn vào thư viện ảnh (Pictures/FOCUSLY) và chia sẻ ảnh/chữ sang ứng dụng khác.
 */
class MediaModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName(): String = NAME

  private fun download(url: String): Pair<ByteArray, String> {
    val c = URL(url).openConnection() as HttpURLConnection
    c.connectTimeout = 15000
    c.readTimeout = 30000
    try {
      val type = c.contentType?.substringBefore(';')?.trim()?.takeIf { it.startsWith("image/") } ?: "image/jpeg"
      return c.inputStream.use { it.readBytes() } to type
    } finally {
      c.disconnect()
    }
  }

  private fun ext(type: String) = when (type) {
    "image/png" -> "png"
    "image/webp" -> "webp"
    "image/gif" -> "gif"
    else -> "jpg"
  }

  /** Lưu ảnh vào Thư viện ảnh. Android 10+ không cần quyền; Android 7–9 cần quyền bộ nhớ (JS xin trước). */
  @ReactMethod
  fun saveImage(url: String, promise: Promise) {
    thread {
      try {
        val (bytes, type) = download(url)
        val name = "focusly-${System.currentTimeMillis()}.${ext(type)}"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, type)
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/FOCUSLY")
            put(MediaStore.Images.Media.IS_PENDING, 1)
          }
          val resolver = ctx.contentResolver
          val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: throw Exception("Không tạo được ảnh")
          resolver.openOutputStream(uri)?.use { it.write(bytes) }
          values.clear()
          values.put(MediaStore.Images.Media.IS_PENDING, 0)
          resolver.update(uri, values, null, null)
        } else {
          @Suppress("DEPRECATION")
          val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "FOCUSLY")
          dir.mkdirs()
          val f = File(dir, name)
          f.writeBytes(bytes)
          @Suppress("DEPRECATION")
          ctx.sendBroadcast(Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(f)))
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("SAVE_FAILED", e.message ?: "Không lưu được ảnh", e)
      }
    }
  }

  /** Chia sẻ ảnh (kèm chữ nếu có) sang ứng dụng khác: Zalo, Messenger, Drive… */
  @ReactMethod
  fun shareImage(url: String, text: String?, promise: Promise) {
    thread {
      try {
        val (bytes, mime) = download(url)
        val dir = File(ctx.cacheDir, "shared").apply { mkdirs() }
        dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 3600_000) it.delete() }
        val f = File(dir, "focusly-${System.currentTimeMillis()}.${ext(mime)}")
        f.writeBytes(bytes)
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", f)
        val send = Intent(Intent.ACTION_SEND).apply {
          setType(mime)
          putExtra(Intent.EXTRA_STREAM, uri)
          if (!text.isNullOrBlank()) putExtra(Intent.EXTRA_TEXT, text)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val activity = ctx.currentActivity
        val chooser = Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        if (activity == null) chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        android.os.Handler(android.os.Looper.getMainLooper()).post {
          try {
            (activity ?: ctx).startActivity(chooser)
            promise.resolve(true)
          } catch (e: Exception) {
            promise.reject("SHARE_FAILED", e.message ?: "Không mở được bảng chia sẻ", e)
          }
        }
      } catch (e: Exception) {
        promise.reject("SHARE_FAILED", e.message ?: "Không chia sẻ được ảnh", e)
      }
    }
  }

  /** Sao chép chữ (React Native không còn Clipboard sẵn) */
  @ReactMethod
  fun copyText(text: String) {
    android.os.Handler(android.os.Looper.getMainLooper()).post {
      val cm = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
      cm.setPrimaryClip(android.content.ClipData.newPlainText("FOCUSLY", text))
    }
  }

  companion object {
    const val NAME = "FocuslyMedia"
  }
}
