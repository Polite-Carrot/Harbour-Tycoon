import ExpoModulesCore
import UnityAds

/**
 * Rewarded ads from Unity Ads. Three calls, each a promise:
 *   initialize(gameId, testMode) -> true once the SDK is ready
 *   load(placementId)            -> true when an ad is ready to show, false if none
 *   show(placementId)            -> "completed" | "skipped" | "failed"
 *
 * Unity's SDK reports back through delegates, so each call gets a small
 * delegate object that settles its promise exactly once.
 */
public class UnityAdsModule: Module {
  private var initDelegate: InitDelegate?
  private var loadDelegates: [String: LoadDelegate] = [:]
  private var showDelegate: ShowDelegate?

  public func definition() -> ModuleDefinition {
    Name("UnityAds")

    AsyncFunction("initialize") { (gameId: String, testMode: Bool, promise: Promise) in
      if UnityAds.isInitialized() {
        promise.resolve(true)
        return
      }
      let delegate = InitDelegate(promise)
      self.initDelegate = delegate
      UnityAds.initialize(gameId, testMode: testMode, initializationDelegate: delegate)
    }.runOnQueue(.main)

    AsyncFunction("load") { (placementId: String, promise: Promise) in
      let delegate = LoadDelegate(promise) { [weak self] in self?.loadDelegates[placementId] = nil }
      self.loadDelegates[placementId] = delegate
      UnityAds.load(placementId, loadDelegate: delegate)
    }.runOnQueue(.main)

    AsyncFunction("show") { (placementId: String, promise: Promise) in
      guard let controller = self.appContext?.utilities?.currentViewController() else {
        promise.resolve("failed")
        return
      }
      let delegate = ShowDelegate(promise) { [weak self] in self?.showDelegate = nil }
      self.showDelegate = delegate
      UnityAds.show(controller, placementId: placementId, showDelegate: delegate)
    }.runOnQueue(.main)
  }
}

private final class InitDelegate: NSObject, UnityAdsInitializationDelegate {
  private var promise: Promise?
  init(_ promise: Promise) { self.promise = promise }

  func initializationComplete() {
    promise?.resolve(true)
    promise = nil
  }

  func initializationFailed(_ error: UnityAdsInitializationError, withMessage message: String) {
    promise?.reject("ERR_UNITY_INIT", message)
    promise = nil
  }
}

private final class LoadDelegate: NSObject, UnityAdsLoadDelegate {
  private var promise: Promise?
  private let done: () -> Void
  init(_ promise: Promise, done: @escaping () -> Void) {
    self.promise = promise
    self.done = done
  }

  func unityAdsAdLoaded(_ placementId: String) {
    promise?.resolve(true)
    promise = nil
    done()
  }

  func unityAdsAdFailed(toLoad placementId: String, withError error: UnityAdsLoadError, withMessage message: String) {
    promise?.resolve(false)
    promise = nil
    done()
  }
}

private final class ShowDelegate: NSObject, UnityAdsShowDelegate {
  private var promise: Promise?
  private let done: () -> Void
  init(_ promise: Promise, done: @escaping () -> Void) {
    self.promise = promise
    self.done = done
  }

  func unityAdsShowComplete(_ placementId: String, withFinish state: UnityAdsShowCompletionState) {
    // kUnityShowCompletionStateCompleted is 1 (Skipped is 0) in UnityAdsShowCompletionState.h.
    // Compared by value, so it does not depend on how Swift renames the cases.
    promise?.resolve(state.rawValue == 1 ? "completed" : "skipped")
    promise = nil
    done()
  }

  func unityAdsShowFailed(_ placementId: String, withError error: UnityAdsShowError, withMessage message: String) {
    promise?.resolve("failed")
    promise = nil
    done()
  }

  func unityAdsShowStart(_ placementId: String) {}
  func unityAdsShowClick(_ placementId: String) {}
}
