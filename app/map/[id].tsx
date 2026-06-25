import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../../store/entriesStore';
import { useFormStore } from '../../store/formStore';
import { entryLocation, googleMapsUrl, mapRegion, MapPoint } from '../../utils/mapHelpers';
import { getEntryDisplayNumbers } from '../../utils/entryNumbering';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';
import { useThemeStore } from '../../store/themeStore';

export default function MapScreen() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const themeMode = useThemeStore((s) => s.mode);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const allEntries = useEntriesStore((s) => s.entries);
  const schema = useFormStore((s) => s.schema);
  // Only show pins for the currently active form — entries from other forms
  // must not leak onto the map.
  const entries = useMemo(
    () => (schema ? allEntries.filter((e) => e.formTitle === schema.formTitle) : []),
    [allEntries, schema],
  );
  const displayNumbers = useMemo(() => getEntryDisplayNumbers(entries), [entries]);
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [showsUserLocation, setShowsUserLocation] = useState(false);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => setShowsUserLocation(status === 'granted'))
      .catch(() => setShowsUserLocation(false));
  }, []);

  const mapPoints = useMemo(
    () =>
      entries
        .map((item) => {
          const location = entryLocation(item);
          const number = displayNumbers.get(item.id) ?? 0;
          if (!location) return null;
          return {
            id: item.id,
            title: `Entry #${String(number).padStart(2, '0')}`,
            coordinate: { latitude: location.lat, longitude: location.lng },
          };
        })
        .filter((point): point is MapPoint => !!point),
    [entries, displayNumbers]
  );

  const currentEntry = entries.find((e) => e.id === id);
  const currentLocation = currentEntry ? entryLocation(currentEntry) : null;
  const fallbackLat = currentLocation?.lat ?? mapPoints[0]?.coordinate.latitude ?? 0;
  const fallbackLng = currentLocation?.lng ?? mapPoints[0]?.coordinate.longitude ?? 0;

  const initialRegion = useMemo(
    () => mapRegion(mapPoints, { latitude: fallbackLat, longitude: fallbackLng }),
    [mapPoints, fallbackLat, fallbackLng]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.topBarBody}>
          <Text style={styles.screenTitle}>Locations</Text>
          <Text style={styles.screenSubtitle}>
            {mapPoints.length} {mapPoints.length === 1 ? 'point' : 'points'}
          </Text>
        </View>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        mapType="standard"
        userInterfaceStyle={themeMode}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={showsUserLocation}
        loadingEnabled
        loadingBackgroundColor={colors.background.app}
        loadingIndicatorColor={colors.brand.primary}
        onPress={() => setSelected(null)}
        onMapReady={() => mapRef.current?.animateToRegion(initialRegion, 0)}
      >
        {mapPoints.map((point) => (
          <Marker
            key={point.id}
            coordinate={point.coordinate}
            title={point.title}
            pinColor={point.id === id ? colors.brand.primary : colors.text.secondary}
            onPress={(e) => {
              e.stopPropagation();
              setSelected(point);
            }}
          />
        ))}
      </MapView>

      <View style={[styles.detailCard, { marginBottom: insets.bottom + 16 }]}>
        {selected ? (
          <>
            <TouchableOpacity
              style={styles.detailInfoRow}
              onPress={() => router.push(`/entry/${selected.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.detailBadge}>
                <MaterialIcons name="location-on" size={18} color={colors.brand.primary} />
              </View>
              <View style={styles.detailInfo}>
                <Text style={styles.detailTitle}>{selected.title}</Text>
                <Text style={styles.detailCoords}>
                  {selected.coordinate.latitude.toFixed(5)}, {selected.coordinate.longitude.toFixed(5)}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.border.input} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navigateBtn}
              onPress={() =>
                Linking.openURL(
                  googleMapsUrl(selected.coordinate.latitude, selected.coordinate.longitude)
                )
              }
              activeOpacity={0.85}
            >
              <MaterialIcons name="directions" size={18} color={colors.text.inverse} />
              <Text style={styles.navigateText}>Navigate</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.detailHintRow}>
            <MaterialIcons name="touch-app" size={18} color={colors.text.muted} />
            <Text style={styles.detailHint}>Tap a pin to see its location</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.app },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarBody: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 4,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: colors.text.primary,
  },
  screenSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 1,
  },

  map: { flex: 1 },

  detailCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 14,
    shadowColor: colors.shadow.black,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  detailBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.background.soft,
    borderWidth: 1,
    borderColor: colors.border.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  detailInfoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  detailInfo: { flex: 1, minWidth: 0, gap: 2 },
  detailTitle: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  detailCoords: { fontSize: 12, color: colors.text.secondary },
  detailHintRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  detailHint: { fontSize: 13, color: colors.text.muted },
  navigateBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.action.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
  },
  navigateText: { fontSize: 13, fontWeight: '700', color: colors.text.inverse },
});
