package com.focuslymobile

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

/**
 * FOCUSLY – Đọc thành tiếng flashcard (TextToSpeech có sẵn của Android)
 * và nghe giọng nói để luyện phát âm (hộp thoại nhận giọng nói của Google, không cần quyền micro riêng).
 */
class SpeechModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var queued: Triple<String, String, Float>? = null
  private var pending: Promise? = null

  private val listener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST) return
      val promise = pending ?: return
      pending = null
      if (resultCode != Activity.RESULT_OK) {
        promise.resolve(null)
        return
      }
      val list = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) ?: arrayListOf()
      val arr = Arguments.createArray()
      list.forEach { arr.pushString(it) }
      promise.resolve(arr)
    }
  }

  init {
    ctx.addActivityEventListener(listener)
  }

  override fun getName(): String = NAME

  private fun ensureTts() {
    if (tts != null) return
    tts = TextToSpeech(ctx.applicationContext) { status ->
      ttsReady = status == TextToSpeech.SUCCESS
      queued?.let { (t, l, r) -> say(t, l, r) }
      queued = null
    }
  }

  private fun say(text: String, lang: String, rate: Float) {
    val engine = tts ?: return
    engine.setLanguage(Locale.forLanguageTag(lang))
    engine.setSpeechRate(rate)
    engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "focusly")
  }

  @ReactMethod
  fun speak(text: String, lang: String, rate: Double, promise: Promise) {
    ensureTts()
    if (!ttsReady) {
      queued = Triple(text, lang, rate.toFloat())
      promise.resolve(true)
      return
    }
    val res = tts?.isLanguageAvailable(Locale.forLanguageTag(lang)) ?: TextToSpeech.LANG_NOT_SUPPORTED
    say(text, lang, rate.toFloat())
    promise.resolve(res >= TextToSpeech.LANG_AVAILABLE)
  }

  @ReactMethod
  fun stop() {
    tts?.stop()
  }

  /** Trả về danh sách câu nghe được (null nếu huỷ) */
  @ReactMethod
  fun listen(lang: String, prompt: String, promise: Promise) {
    val activity = ctx.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Ứng dụng chưa sẵn sàng")
      return
    }
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
      putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
    }
    if (intent.resolveActivity(activity.packageManager) == null) {
      promise.reject("E_NO_RECOGNIZER", "Máy chưa có dịch vụ nhận giọng nói (cài Google app)")
      return
    }
    pending?.resolve(null)
    pending = promise
    activity.startActivityForResult(intent, REQUEST)
  }

  override fun invalidate() {
    tts?.shutdown()
    tts = null
    super.invalidate()
  }

  companion object {
    const val NAME = "FocuslySpeech"
    private const val REQUEST = 7311
  }
}
