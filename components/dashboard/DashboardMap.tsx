import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { APIProvider, Map, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';
import { AppColors } from '../../theme/colors';

export type DashboardMapPoint = {
  id: string;
  title: string;
  subtitle?: string;
  lat: number;
  lng: number;
};

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

// Pans to the selected point without making the whole <Map> a controlled
// component (defaultCenter/defaultZoom stay uncontrolled so user pan/zoom
// isn't fought on every render) — reacts only to `selectedId` changing.
function PanToSelected({ point }: { point: DashboardMapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && point) map.panTo({ lat: point.lat, lng: point.lng });
  }, [map, point]);
  return null;
}

// Web-only map view. react-native-maps (used by app/map/[id].tsx on native)
// has no web support at all, so this wraps the Google Maps JavaScript API via
// @vis.gl/react-google-maps instead — a maintained React wrapper around the
// same Maps JS API Collector-Web's dashboard.js already used successfully.
// Uses the classic `Marker` (not `AdvancedMarker`) to avoid requiring a
// Google Cloud "Map ID" to be provisioned just for this first pass.
//
// Selection is fully controlled by the parent (`selectedId`/`onSelectedIdChange`)
// so a sidebar list (app/map.web.tsx) and marker clicks share one source of
// truth — clicking either selects/pans to the same point.
export default function DashboardMap({
  points,
  selectedId,
  onSelectedIdChange,
  onOpenExternal,
}: {
  points: DashboardMapPoint[];
  selectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;
  onOpenExternal?: (id: string) => void;
}) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={[styles.fallback]}>
        <Text style={styles.fallbackText}>
          Map unavailable — EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.
        </Text>
      </View>
    );
  }

  const center = points.length
    ? { lat: points[0].lat, lng: points[0].lng }
    : { lat: 20, lng: 0 };
  const active = points.find((p) => p.id === selectedId) ?? null;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <Map
        defaultCenter={center}
        defaultZoom={points.length > 1 ? 11 : points.length === 1 ? 14 : 2}
        style={{ width: '100%', height: '100%' }}
        gestureHandling="greedy"
        disableDefaultUI={false}
      >
        <PanToSelected point={active} />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            onClick={() => onSelectedIdChange?.(p.id)}
          />
        ))}
        {active ? (
          <InfoWindow
            position={{ lat: active.lat, lng: active.lng }}
            onCloseClick={() => onSelectedIdChange?.(null)}
          >
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>{active.title}</Text>
              {active.subtitle ? <Text style={styles.infoSubtitle}>{active.subtitle}</Text> : null}
              {onOpenExternal ? (
                <TouchableOpacity onPress={() => onOpenExternal(active.id)}>
                  <Text style={styles.infoLink}>Open in Google Maps ↗</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </InfoWindow>
        ) : null}
      </Map>
    </APIProvider>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.muted,
    padding: 24,
  },
  fallbackText: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  infoCard: {
    padding: 4,
    gap: 4,
    minWidth: 140,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  infoSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  infoLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.brand.primary,
    marginTop: 4,
  },
});
