import type { ExpoConfig } from 'expo/config';

/**
 * Dynamic config so the web build can be served from a subpath.
 *
 * GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
 * but Expo's web export writes absolute asset URLs (/_expo/static/...). Those
 * 404 under a subpath, so `npm run publish:web` sets PAGES_BASE_URL=/Harbour-Tycoon
 * and Expo rewrites every asset URL to match.
 *
 * It stays empty for local dev and native builds, which are served from root.
 */
const baseUrl = process.env.PAGES_BASE_URL ?? '';

const config: ExpoConfig = {
  name: 'Harbour Tycoon',
  slug: 'harbour-tycoon',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.politecarrot.harbourtycoon',
    infoPlist: {
      // Unity Ads' ad network, so iOS can credit installs from its ads.
      SKAdNetworkItems: [{ SKAdNetworkIdentifier: '4dzt52r2t5.skadnetwork' }],
      // No encryption beyond what iOS itself provides (HTTPS).
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.politecarrot.harbourtycoon',
    adaptiveIcon: {
      backgroundColor: '#1a88e8',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
    // 'single' = plain SPA. 'static' would pull in expo-router, which this
    // one-screen app does not use.
    output: 'single',
  },
  plugins: [
    [
      'expo-tracking-transparency',
      {
        // The words in Apple's tracking prompt.
        userTrackingPermission:
          'This lets the ads you choose to watch be matched to your interests. Ads still play if you say no, just generic ones.',
      },
    ],
  ],
  experiments: {
    baseUrl,
  },
};

export default config;
