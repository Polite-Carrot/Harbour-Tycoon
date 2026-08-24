import type { ExpoConfig } from 'expo/config';

/**
 * Dynamic config so the web build can be served from a subpath.
 *
 * GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
 * but Expo's web export writes absolute asset URLs (/_expo/static/...). Those
 * 404 under a subpath, so the deploy workflow sets PAGES_BASE_URL=/Harbour-Tycoon
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
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
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
  experiments: {
    baseUrl,
  },
};

export default config;
