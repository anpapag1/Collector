import { useEffect, useState } from 'react';
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
import { loadBundledConfig } from '../utils/schemaLoader';
import { useFormStore } from '../store/formStore';
import { usePickerStore } from '../store/pickerStore';
import { useEntriesStore } from '../store/entriesStore';
import { useAuthStore } from '../store/authStore';

SplashScreen.preventAutoHideAsync().catch((e) => console.warn('preventAutoHideAsync failed', e));

export default function RootLayout() {
  const hasInitialized = useFormStore((s) => s.hasInitialized);
  const loadSchema = useFormStore((s) => s.loadSchema);
  const setActivePresetId = usePickerStore((s) => s.setActivePresetId);
  const initAuth = useAuthStore((s) => s.init);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  const [hasHydrated, setHasHydrated] = useState(
    useFormStore.persist.hasHydrated() &&
      useEntriesStore.persist.hasHydrated() &&
      usePickerStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (hasHydrated) return;
    const checkAllHydrated = () => {
      if (
        useFormStore.persist.hasHydrated() &&
        useEntriesStore.persist.hasHydrated() &&
        usePickerStore.persist.hasHydrated()
      ) {
        setHasHydrated(true);
      }
    };
    const unsubForm = useFormStore.persist.onFinishHydration(checkAllHydrated);
    const unsubEntries = useEntriesStore.persist.onFinishHydration(checkAllHydrated);
    const unsubPicker = usePickerStore.persist.onFinishHydration(checkAllHydrated);
    checkAllHydrated();
    return () => {
      unsubForm();
      unsubEntries();
      unsubPicker();
    };
  }, [hasHydrated]);

  useEffect(() => {
    if (fontsLoaded && hasHydrated) {
      if (!hasInitialized) {
        try {
          loadSchema(loadBundledConfig());
          setActivePresetId('template');
        } catch (e) {
          console.warn('Failed to load bundled config', e);
          useFormStore.setState({ hasInitialized: true });
        }
      }
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, hasHydrated, hasInitialized, loadSchema, setActivePresetId]);

  if (!fontsLoaded || !hasHydrated) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.root}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
