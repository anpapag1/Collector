import React, { useEffect } from 'react';
import { router } from 'expo-router';

// Fallback sibling required by Expo Router for auth-callback.web.tsx (see
// map.tsx for the same reasoning). Native's OAuth flow is a deep link caught
// by authStore, but Expo Router listens to deep links globally and WILL route 
// to this path. We must immediately pop this screen to return the user to the
// login screen, allowing its `openAuthSessionAsync` promise to resolve and 
// cleanly navigate back to wherever the user came from.
export default function AuthCallbackFallback() {
  useEffect(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, []);
  
  return null;
}
