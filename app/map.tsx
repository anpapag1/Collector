import React from 'react';
import { Redirect } from 'expo-router';

// Expo Router requires a platform-unsuffixed "fallback sibling" file for any
// `.web.tsx` route override (map.web.tsx here) — without one it throws at
// startup. Native has no reason to land on the paramless /map route (its
// map screen is the dynamic app/map/[id].tsx), so just bounce home.
export default function MapFallback() {
  return <Redirect href="/" />;
}
