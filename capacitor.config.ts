import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.datalaw.recnik',
  appName: 'Rečnik',
  webDir: 'dist',
  android: {
    backgroundColor: '#ECDCC4',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false, // прячем вручную после гидрации (src/main.tsx)
      backgroundColor: '#ECDCC4',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
