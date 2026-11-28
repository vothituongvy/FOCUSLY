package com.focuslymobile

import android.animation.ValueAnimator
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import kotlin.math.abs

/**
 * FOCUSLY – "Bong bóng chat" nổi trên màn hình khi app ở nền (giống Messenger/Zalo).
 * Cần quyền "Hiển thị trên ứng dụng khác" (SYSTEM_ALERT_WINDOW).
 * - Chạm: mở app vào đúng cuộc trò chuyện, bong bóng biến mất.
 * - Kéo thả tự do, thả ra tự bám mép; kéo xuống vòng ✕ ở dưới để tắt.
 * - Mở app (MainActivity.onResume) -> tự ẩn.
 */
object ChatHeads {
  private const val PREFS = "focusly_chat_heads"
  private val main = Handler(Looper.getMainLooper())
  private var bubble: FrameLayout? = null
  private var avatarView: ImageView? = null
  private var initialsView: TextView? = null
  private var badgeView: TextView? = null
  private var closeView: TextView? = null
  private var params: WindowManager.LayoutParams? = null
  private var count = 0
  private var link: String? = null
  private var shownChat: String? = null

  fun isEnabled(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", true)
  fun setEnabled(ctx: Context, on: Boolean) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", on).apply()
    if (!on) hide(ctx)
  }

  fun canDraw(ctx: Context) = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx)

  private fun dp(ctx: Context, v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics).toInt()

  @Suppress("DEPRECATION")
  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else WindowManager.LayoutParams.TYPE_PHONE

  fun show(context: Context, chatId: String, name: String, avatarUrl: String?, chatLink: String) {
    val ctx = context.applicationContext
    if (!isEnabled(ctx) || !canDraw(ctx)) return
    main.post {
      try {
        if (bubble == null) create(ctx)
        if (shownChat != chatId) {
          count = 0
          setAvatar(ctx, name, avatarUrl)
        }
        shownChat = chatId
        link = chatLink
        count += 1
        badgeView?.apply {
          text = if (count > 99) "99+" else count.toString()
          visibility = View.VISIBLE
        }
        // nảy nhẹ khi có tin mới
        bubble?.animate()?.scaleX(1.15f)?.scaleY(1.15f)?.setDuration(120)?.withEndAction {
          bubble?.animate()?.scaleX(1f)?.scaleY(1f)?.setDuration(160)?.start()
        }?.start()
      } catch (_: Exception) {
        // không có quyền / cửa sổ bị chặn -> bỏ qua, vẫn còn thông báo thường
      }
    }
  }

  fun hide(context: Context) {
    val ctx = context.applicationContext
    main.post {
      val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      listOf(bubble, closeView).forEach { v -> if (v != null) try { wm.removeView(v) } catch (_: Exception) {} }
      bubble = null
      closeView = null
      avatarView = null
      initialsView = null
      badgeView = null
      params = null
      count = 0
      shownChat = null
    }
  }

  private fun setAvatar(ctx: Context, name: String, url: String?) {
    val initials = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.let { p ->
      ((p.firstOrNull()?.take(1) ?: "") + (if (p.size > 1) p.last().take(1) else "")).uppercase()
    }
    initialsView?.text = initials.ifEmpty { "?" }
    initialsView?.visibility = View.VISIBLE
    avatarView?.visibility = View.GONE
    if (url.isNullOrBlank()) return
    thread {
      val bmp: Bitmap? = try {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 8000
        c.readTimeout = 8000
        c.inputStream.use { BitmapFactory.decodeStream(it) }
      } catch (_: Exception) { null }
      if (bmp != null) main.post {
        val d = RoundedBitmapDrawableFactory.create(ctx.resources, bmp).apply { isCircular = true }
        avatarView?.setImageDrawable(d)
        avatarView?.visibility = View.VISIBLE
        initialsView?.visibility = View.GONE
      }
    }
  }

  private fun create(ctx: Context) {
    val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val size = dp(ctx, 60f)
    val metrics = ctx.resources.displayMetrics

    val root = FrameLayout(ctx).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.WHITE)
      }
      elevation = dp(ctx, 8f).toFloat()
      val pad = dp(ctx, 3f)
      setPadding(pad, pad, pad, pad)
      clipToPadding = false
      clipChildren = false
    }
    val inner = size - dp(ctx, 6f)
    initialsView = TextView(ctx).apply {
      gravity = Gravity.CENTER
      setTextColor(Color.parseColor("#16203A"))
      setTypeface(typeface, Typeface.BOLD)
      textSize = 20f
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#FFCF2E"))
      }
    }
    avatarView = ImageView(ctx).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      visibility = View.GONE
    }
    root.addView(initialsView, FrameLayout.LayoutParams(inner, inner, Gravity.CENTER))
    root.addView(avatarView, FrameLayout.LayoutParams(inner, inner, Gravity.CENTER))
    badgeView = TextView(ctx).apply {
      setTextColor(Color.WHITE)
      textSize = 11f
      setTypeface(typeface, Typeface.BOLD)
      gravity = Gravity.CENTER
      val h = dp(ctx, 6f)
      setPadding(h, 0, h, 0)
      minWidth = dp(ctx, 22f)
      background = GradientDrawable().apply {
        cornerRadius = dp(ctx, 11f).toFloat()
        setColor(Color.parseColor("#C93B2C"))
        setStroke(dp(ctx, 2f), Color.WHITE)
      }
      visibility = View.GONE
    }
    root.addView(badgeView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(ctx, 22f), Gravity.TOP or Gravity.END).apply {
      topMargin = -dp(ctx, 4f)
      marginEnd = -dp(ctx, 4f)
    })

    val p = WindowManager.LayoutParams(
      size, size, overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = metrics.widthPixels - size - dp(ctx, 8f)
      y = (metrics.heightPixels * 0.22f).toInt()
    }
    params = p

    // vòng ✕ để tắt (chỉ hiện khi đang kéo)
    val closeSize = dp(ctx, 56f)
    val close = TextView(ctx).apply {
      text = "✕"
      textSize = 22f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#99000000"))
      }
      visibility = View.GONE
    }
    val closeParams = WindowManager.LayoutParams(
      closeSize, closeSize, overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      y = dp(ctx, 90f)
    }

    val slop = ViewConfiguration.get(ctx).scaledTouchSlop
    var downX = 0f
    var downY = 0f
    var startX = 0
    var startY = 0
    var moved = false
    fun overClose(): Boolean {
      val cx = p.x + size / 2
      val cy = p.y + size / 2
      val tx = metrics.widthPixels / 2
      val ty = metrics.heightPixels - dp(ctx, 90f) - closeSize / 2
      return abs(cx - tx) < dp(ctx, 80f) && abs(cy - ty) < dp(ctx, 90f)
    }
    root.setOnTouchListener { _, e ->
      when (e.action) {
        MotionEvent.ACTION_DOWN -> {
          downX = e.rawX; downY = e.rawY; startX = p.x; startY = p.y; moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = e.rawX - downX
          val dy = e.rawY - downY
          if (!moved && (abs(dx) > slop || abs(dy) > slop)) {
            moved = true
            close.visibility = View.VISIBLE
          }
          if (moved) {
            p.x = (startX + dx).toInt()
            p.y = (startY + dy).toInt()
            try { wm.updateViewLayout(root, p) } catch (_: Exception) {}
            val hot = overClose()
            close.scaleX = if (hot) 1.2f else 1f
            close.scaleY = if (hot) 1.2f else 1f
            (close.background as GradientDrawable).setColor(Color.parseColor(if (hot) "#C93B2C" else "#99000000"))
          }
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          close.visibility = View.GONE
          if (!moved) {
            openApp(ctx)
          } else if (overClose()) {
            hide(ctx)
          } else {
            // bám mép gần nhất
            val toX = if (p.x + size / 2 < metrics.widthPixels / 2) dp(ctx, 8f) else metrics.widthPixels - size - dp(ctx, 8f)
            p.y = p.y.coerceIn(dp(ctx, 24f), metrics.heightPixels - size - dp(ctx, 60f))
            ValueAnimator.ofInt(p.x, toX).apply {
              duration = 220
              addUpdateListener {
                p.x = it.animatedValue as Int
                try { wm.updateViewLayout(root, p) } catch (_: Exception) {}
              }
              start()
            }
          }
          true
        }
        else -> false
      }
    }

    wm.addView(close, closeParams)
    wm.addView(root, p)
    closeView = close
    bubble = root
  }

  private fun openApp(ctx: Context) {
    val l = link
    hide(ctx)
    val i = Intent(ctx, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      if (!l.isNullOrEmpty()) putExtra(NotifyModule.LINK_EXTRA, l)
    }
    try { ctx.startActivity(i) } catch (_: Exception) {}
  }
}
