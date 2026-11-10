import type { CapacitorConfig } from '@capacitor/cli'

// The native shell wraps the Vite build in dist. The web app at gimme.gg is
// unchanged; this is a second distribution of the same bundle.
const config: CapacitorConfig = {
  appId: 'gg.gimme.app',
  appName: 'Gimme',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // Hidden from src/lib/native.ts once the first frame has painted.
      launchAutoHide: false,
      backgroundColor: '#16263B',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#16263B',
    },
    Keyboard: {
      resize: 'body',
    },
  },
}

export default config
