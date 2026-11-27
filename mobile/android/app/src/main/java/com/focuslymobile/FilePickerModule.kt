package com.focuslymobile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.io.File

/**
 * FOCUSLY – Chọn 1 file từ máy (Word, Excel, PDF, TXT...) bằng trình chọn file của Android.
 * File được chép vào thư mục cache của app rồi trả về đường dẫn file:// để JS tải lên máy chủ.
 * Không cần quyền đọc bộ nhớ (Storage Access Framework).
 */
class FilePickerModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  private var pending: Promise? = null

  private val listener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST) return
      val promise = pending ?: return
      pending = null
      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(null) // người dùng bấm huỷ
        return
      }
      try {
        promise.resolve(copyToCache(uri))
      } catch (e: Exception) {
        promise.reject("E_PICK", e.message ?: "Không đọc được file", e)
      }
    }
  }

  init {
    ctx.addActivityEventListener(listener)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun pick(mimeTypes: ReadableArray, promise: Promise) {
    val activity = ctx.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Ứng dụng chưa sẵn sàng")
      return
    }
    pending?.resolve(null)
    pending = promise
    val types = (0 until mimeTypes.size()).mapNotNull { mimeTypes.getString(it) }.toTypedArray()
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      if (types.isNotEmpty()) putExtra(Intent.EXTRA_MIME_TYPES, types)
    }
    try {
      activity.startActivityForResult(intent, REQUEST)
    } catch (e: Exception) {
      pending = null
      promise.reject("E_PICK", e.message ?: "Không mở được trình chọn file", e)
    }
  }

  private fun copyToCache(uri: Uri): com.facebook.react.bridge.WritableMap {
    val resolver = ctx.contentResolver
    var name = "file"
    var size = -1L
    resolver.query(uri, null, null, null, null)?.use { c ->
      if (c.moveToFirst()) {
        val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val si = c.getColumnIndex(OpenableColumns.SIZE)
        if (ni >= 0) name = c.getString(ni) ?: name
        if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
      }
    }
    if (size > MAX_BYTES) throw IllegalArgumentException("File quá lớn (tối đa 15 MB)")
    val dir = File(ctx.cacheDir, "picked").apply { mkdirs() }
    dir.listFiles()?.forEach { it.delete() } // dọn file chọn lần trước
    val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_")
    val out = File(dir, safe)
    resolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } }
      ?: throw IllegalStateException("Không đọc được file")
    return Arguments.createMap().apply {
      putString("uri", Uri.fromFile(out).toString())
      putString("name", name)
      putString("type", resolver.getType(uri) ?: "application/octet-stream")
      putDouble("size", out.length().toDouble())
    }
  }

  companion object {
    const val NAME = "FilePicker"
    private const val REQUEST = 4711
    private const val MAX_BYTES = 15L * 1024 * 1024
  }
}
