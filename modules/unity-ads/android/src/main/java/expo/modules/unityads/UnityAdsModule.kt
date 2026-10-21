package expo.modules.unityads

import com.unity3d.ads.IUnityAdsInitializationListener
import com.unity3d.ads.IUnityAdsLoadListener
import com.unity3d.ads.IUnityAdsShowListener
import com.unity3d.ads.UnityAds
import com.unity3d.ads.UnityAdsShowOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Rewarded ads from Unity Ads. Three calls, each a promise:
 *   initialize(gameId, testMode) -> true once the SDK is ready
 *   load(placementId)            -> true when an ad is ready to show, false if none
 *   show(placementId)            -> "completed" | "skipped" | "failed"
 */
class UnityAdsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UnityAds")

    AsyncFunction("initialize") { gameId: String, testMode: Boolean, promise: Promise ->
      if (UnityAds.isInitialized) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_UNITY_INIT", "No Android context", null)
        return@AsyncFunction
      }
      UnityAds.initialize(context, gameId, testMode, object : IUnityAdsInitializationListener {
        override fun onInitializationComplete() = promise.resolve(true)
        override fun onInitializationFailed(error: UnityAds.UnityAdsInitializationError?, message: String?) =
          promise.reject("ERR_UNITY_INIT", message ?: "Unity Ads failed to start", null)
      })
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("load") { placementId: String, promise: Promise ->
      UnityAds.load(placementId, object : IUnityAdsLoadListener {
        override fun onUnityAdsAdLoaded(placementId: String?) = promise.resolve(true)
        override fun onUnityAdsFailedToLoad(placementId: String?, error: UnityAds.UnityAdsLoadError?, message: String?) =
          promise.resolve(false)
      })
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("show") { placementId: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve("failed")
        return@AsyncFunction
      }
      UnityAds.show(activity, placementId, UnityAdsShowOptions(), object : IUnityAdsShowListener {
        override fun onUnityAdsShowComplete(placementId: String?, state: UnityAds.UnityAdsShowCompletionState?) =
          promise.resolve(if (state == UnityAds.UnityAdsShowCompletionState.COMPLETED) "completed" else "skipped")
        override fun onUnityAdsShowFailure(placementId: String?, error: UnityAds.UnityAdsShowError?, message: String?) =
          promise.resolve("failed")
        override fun onUnityAdsShowStart(placementId: String?) {}
        override fun onUnityAdsShowClick(placementId: String?) {}
      })
    }.runOnQueue(Queues.MAIN)
  }
}
