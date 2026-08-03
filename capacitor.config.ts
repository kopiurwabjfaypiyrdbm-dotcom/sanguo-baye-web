import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sumo91.sanguobaye.debug',
  appName: '三国霸业',
  webDir: 'dist',
  backgroundColor: '#101b19',
  loggingBehavior: 'debug',
  android: {
    allowMixedContent: false,
    backgroundColor: '#101b19',
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
