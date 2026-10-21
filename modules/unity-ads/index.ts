import { requireOptionalNativeModule } from 'expo-modules-core';

/** How a shown ad ended. Only 'completed' earns the reward. */
export type ShowResult = 'completed' | 'skipped' | 'failed';

interface UnityAdsNative {
  initialize(gameId: string, testMode: boolean): Promise<boolean>;
  /** Resolves false (never throws) when no ad could be loaded. */
  load(placementId: string): Promise<boolean>;
  show(placementId: string): Promise<ShowResult>;
}

/**
 * The native Unity Ads bridge (ios/UnityAdsModule.swift and
 * android/.../UnityAdsModule.kt), or null where it is not built in: the web,
 * and Expo Go.
 */
export const UnityAds = requireOptionalNativeModule<UnityAdsNative>('UnityAds');
