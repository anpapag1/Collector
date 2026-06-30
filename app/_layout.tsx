import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import * as Sentry from '@sentry/react-native';
import { useFormStore } from '../store/formStore';
import { usePickerStore } from '../store/pickerStore';
import { useEntriesStore } from '../store/entriesStore';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { useThemeStore } from '../store/themeStore';
import { useOnboardingStore } from '../store/onboardingStore';
import DialogHost from '../components/DialogHost';
import OnboardingModal from '../components/OnboardingModal';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 1.0,
  });
}

SplashScreen.preventAutoHideAsync().catch((e) => console.warn('preventAutoHideAsync failed', e));

function RootLayout() {
  const hasInitialized = useFormStore((s) => s.hasInitialized);
  const initAuth = useAuthStore((s) => s.init);
  const initSync = useSyncStore((s) => s.init);
  const themeMode = useThemeStore((s) => s.mode);

  useEffect(() => {
    initAuth();
    initSync();
  }, [initAuth, initSync]);

  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  const [hasHydrated, setHasHydrated] = useState(
    useFormStore.persist.hasHydrated() &&
      useEntriesStore.persist.hasHydrated() &&
      usePickerStore.persist.hasHydrated() &&
      useThemeStore.persist.hasHydrated() &&
      useOnboardingStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (hasHydrated) return;
    const checkAllHydrated = () => {
      if (
        useFormStore.persist.hasHydrated() &&
        useEntriesStore.persist.hasHydrated() &&
        usePickerStore.persist.hasHydrated() &&
        useThemeStore.persist.hasHydrated() &&
        useOnboardingStore.persist.hasHydrated()
      ) {
        setHasHydrated(true);
      }
    };
    const unsubForm = useFormStore.persist.onFinishHydration(checkAllHydrated);
    const unsubEntries = useEntriesStore.persist.onFinishHydration(checkAllHydrated);
    const unsubPicker = usePickerStore.persist.onFinishHydration(checkAllHydrated);
    const unsubTheme = useThemeStore.persist.onFinishHydration(checkAllHydrated);
    const unsubOnboarding = useOnboardingStore.persist.onFinishHydration(checkAllHydrated);
    checkAllHydrated();
    return () => {
      unsubForm();
      unsubEntries();
      unsubPicker();
      unsubTheme();
      unsubOnboarding();
    };
  }, [hasHydrated]);

  useEffect(() => {
    if (fontsLoaded && hasHydrated) {
      if (!hasInitialized) {
        useFormStore.setState({ hasInitialized: true });
      }
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, hasHydrated, hasInitialized]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(themeMode === 'dark' ? '#050708' : '#F7FBFE')
      .catch((e) => console.warn('Failed to update system background', e));
  }, [themeMode]);

  if (!fontsLoaded || !hasHydrated) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.root}>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} animated />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: themeMode === 'dark' ? '#050708' : '#F7FBFE',
            },
          }}
        />
        <DialogHost />
        <OnboardingModal />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

// Only wrap with Sentry's profiler when Sentry is actually initialized —
// wrapping unconditionally logs a "Sentry.wrap called before Sentry.init"
// warning on every boot while no DSN is configured.
export default sentryDsn ? Sentry.wrap(RootLayout) : RootLayout;
