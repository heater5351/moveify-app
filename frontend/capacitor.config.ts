import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moveifyhealth.app',
  appName: 'Moveify',
  webDir: 'dist',
  server: {
    // Ensures localStorage/cookies behave like a real HTTPS origin in the WebView
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#132232', // Moveify navy
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK', // light text on dark background
      backgroundColor: '#132232',
    },
  },
};

export default config;
