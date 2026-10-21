/**
 * Ad network settings. These IDs are public (they ship inside the app), so
 * they live in the code rather than in secrets.
 *
 * Unity Ads, from the Unity dashboard -> Monetization. Each platform is its
 * own app there, with its own Game ID and rewarded placement. A platform
 * set to null falls back to the labelled test ad.
 */
export interface UnityAdsApp {
  gameId: string;
  /** The rewarded placement every ad in the game uses. */
  rewarded: string;
}

export const UNITY_ADS: { ios: UnityAdsApp | null; android: UnityAdsApp | null } = {
  ios: { gameId: '800406628', rewarded: 'BP_Rewarded_iOS' },
  android: { gameId: '800406629', rewarded: 'BP_Rewarded_Android' },
};

/**
 * Unity serves test ads (no real money, safe to tap) in development builds.
 * Release builds show real ads. To see test ads on a release build, add the
 * phone under Monetization -> Settings -> Test device in the dashboard.
 */
export const UNITY_TEST_MODE = __DEV__;
