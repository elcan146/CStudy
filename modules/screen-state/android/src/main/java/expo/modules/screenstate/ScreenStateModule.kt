package expo.modules.screenstate

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.PowerManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScreenStateModule : Module() {
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("ScreenState")

    Events("onScreenState")

    Function("isInteractive") { isScreenInteractive() }
    Function("isUnlocked") { isDeviceUnlocked() }
    Function("getSystemInsets") { getSystemBarInsets() }

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_USER_PRESENT)
      }
      val r = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          handleAction(intent.action)
        }
      }
      receiver = r
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(r, filter)
      }
    }

    OnDestroy {
      receiver?.let { appContext.reactContext?.unregisterReceiver(it) }
      receiver = null
    }
  }

  private fun handleAction(action: String?) {
    when (action) {
      Intent.ACTION_SCREEN_OFF ->
        sendEvent(
          "onScreenState",
          mapOf("interactive" to false, "unlocked" to false)
        )
      Intent.ACTION_USER_PRESENT ->
        sendEvent(
          "onScreenState",
          mapOf("interactive" to true, "unlocked" to true)
        )
      Intent.ACTION_SCREEN_ON ->
        // Screen woke but the lockscreen may still be up — report unlocked
        // only when the keyguard isn't showing (e.g. no lockscreen configured)
        sendEvent(
          "onScreenState",
          mapOf("interactive" to true, "unlocked" to isDeviceUnlocked())
        )
    }
  }

  private fun isScreenInteractive(): Boolean {
    val context = appContext.reactContext ?: return true
    val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    return pm?.isInteractive ?: true
  }

  private fun isDeviceUnlocked(): Boolean {
    val context = appContext.reactContext ?: return true
    val km = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    return km?.isKeyguardLocked != true
  }

  private fun getSystemBarInsets(): Map<String, Int> {
    val activity = appContext.currentActivity ?: return emptyMap()
    val view = activity.window?.decorView ?: return emptyMap()
    val insets = ViewCompat.getRootWindowInsets(view) ?: return emptyMap()
    val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
    val density = activity.resources.displayMetrics.density
    return mapOf(
      "top" to (bars.top / density).toInt(),
      "bottom" to (bars.bottom / density).toInt(),
      "left" to (bars.left / density).toInt(),
      "right" to (bars.right / density).toInt()
    )
  }
}
