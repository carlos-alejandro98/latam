import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Provider } from 'react-redux';

import { setupAuthInterceptor } from '@/infrastructure/interceptors/auth-interceptor';
import { latamSansFontMap } from '@/presentation/assets/fonts/latam-sans';
import { AppThemeProvider } from '@/presentation/theme';
import { store } from '@/store';

setupAuthInterceptor();

void SplashScreen.preventAutoHideAsync();

/**
 * Root application layout.
 * Wraps Redux and theme providers.
 * Carga fuentes locales vía expo-font (equivalente moderno a assets linkados en RN clásico).
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(latamSansFontMap);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <Provider store={store}>
      <AppThemeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AppThemeProvider>
    </Provider>
  );
}
