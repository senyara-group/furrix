import { tokens } from './src/design-system/tokens/tokens';
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.furrix.app',
  appName: 'Furrix',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  backgroundColor: tokens.color.surface.page,
  loggingBehavior: 'none',
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: tokens.color.surface.page },
  },
};

export default config;
