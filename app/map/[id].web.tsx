import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

// react-native-maps (used by the native app/map/[id].tsx) has no web build —
// importing it breaks the entire web bundle, because Expo Router eagerly
// requires every route file (including native-only ones) to build its route
// manifest. This web-only override keeps that import out of the web bundle
// entirely and forwards to the dashboard's own map route instead.
export default function MapEntryRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={id ? `/map?entryId=${id}` : '/map'} />;
}
