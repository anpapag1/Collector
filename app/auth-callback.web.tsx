import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useAppColors } from '../theme/useAppColors';

// Landing page for the web Google OAuth redirect (see
// authStore.signInWithGoogle's Platform.OS === 'web' branch). Supabase's
// client parses the session out of the URL fragment on load
// (detectSessionInUrl: true on web, in lib/supabase.ts) and fires
// onAuthStateChange — this screen just waits for that and bounces to the
// dashboard. Native never routes here; its OAuth flow is a deep link caught
// before Expo Router navigates.
export default function AuthCallback() {
  const colors = useAppColors();
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!initialized) return;
    router.replace(session ? '/' : '/(auth)/login');
  }, [initialized, session]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background.app }}>
      <ActivityIndicator color={colors.brand.primary} />
    </View>
  );
}
