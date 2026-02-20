import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vtalk.app',
  appName: 'Vtalk',
  webDir: 'out',
  // @ts-ignore
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
