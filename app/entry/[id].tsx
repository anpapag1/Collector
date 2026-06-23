import React, { useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  Linking,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../../store/entriesStore';
import { formatDate, timeAgo } from '../../utils/timeUtils';
import { FieldDef, PhotoItem, GpsLocation } from '../../types';
import { selectValueLabel } from '../../utils/formLogic';
import { getEntryDisplayNumbers } from '../../utils/entryNumbering';
import { colors } from '../../theme/colors';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

type MapPoint = {
  id: string;
  title: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
};

function staticMapUrl(lat: number, lng: number) {
  if (GOOGLE_MAPS_API_KEY) {
    const center = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const markerColor = colors.brand.primary.replace('#', '0x');
    const marker = encodeURIComponent(`color:${markerColor}|${center}`);
    return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=15&size=640x260&scale=2&maptype=roadmap&markers=${marker}&key=${GOOGLE_MAPS_API_KEY}`;
  }

  if (!MAPBOX_TOKEN) return null;

  const markerColor = colors.brand.primary.replace('#', '');
  const marker = `pin-s+${markerColor}(${lng.toFixed(6)},${lat.toFixed(6)})`;
  const center = `${lng.toFixed(6)},${lat.toFixed(6)},15,0`;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${center}/640x260@2x?access_token=${MAPBOX_TOKEN}`;
}

export default function EntryDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);

  const entry = entries.find((e) => e.id === id);
  const displayNumbers = useMemo(() => getEntryDisplayNumbers(entries), [entries]);

  if (!entry) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="inventory" size={40} color="#8EA8B8" />
        <Text style={styles.notFound}>Entry not found</Text>
      </View>
    );
  }

  const { data, createdAt, formTitle, fields } = entry;
  const displayNumber = displayNumbers.get(entry.id) ?? 0;
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
            coordinate: {
              latitude: location.lat,
              longitude: location.lng,
            },
          };
        })
        .filter((point): point is MapPoint => !!point),
    [entries, displayNumbers]
  );

  const handleDelete = () => {
    Alert.alert(
      'Delete entry?',
      `Entry #${String(displayNumber).padStart(2, '0')} will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteEntry(entry.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#171d1b" />
        </TouchableOpacity>
        <Text style={styles.topLabel}>Entry #{String(displayNumber).padStart(2, '0')}</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push(`/edit-entry/${entry.id}`)}
        >
          <MaterialIcons name="edit" size={22} color="#3f4946" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, styles.deleteBtn]}
          onPress={handleDelete}
        >
          <MaterialIcons name="delete-outline" size={22} color="#ba1a1a" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            {formTitle ? (
              <View style={styles.formChip}>
                <MaterialIcons name="description" size={13} color="#2589C8" />
                <Text style={styles.formChipText}>{formTitle}</Text>
              </View>
            ) : null}
            <Text style={styles.headerAgo}>{timeAgo(createdAt)}</Text>
          </View>
          <Text style={styles.headerDate}>{formatDate(createdAt)}</Text>
        </View>

        {/* Dynamic fields */}
        {fields
          ? fields.map((field) => renderField(field, data[field.id], mapPoints, entry.id))
          : renderLegacyData(data, mapPoints, entry.id)
        }

        {/* Footer meta */}
        <View style={styles.metaFooter}>
          <Text style={styles.metaRow}>
            <Text style={styles.metaKey}>Entry ID  </Text>
            <Text style={styles.metaMono}>{entry.id}</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function entryLocation(entry: { fields?: FieldDef[]; data: Record<string, any> }) {
  const readLocation = (value: any): { lat: number; lng: number } | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };

  if (entry.fields) {
    for (const field of entry.fields) {
      if (field.type !== 'gps') continue;
      const location = readLocation(entry.data[field.id]);
      if (location) return location;
    }
    return null;
  }

  return readLocation(entry.data.location);
}

function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function googleMapsPointsUrl(points: MapPoint[], fallbackLat: number, fallbackLng: number) {
  if (points.length < 2) return googleMapsUrl(fallbackLat, fallbackLng);

  const ordered = points.slice(0, 10);
  const origin = ordered[0].coordinate;
  const destination = ordered[ordered.length - 1].coordinate;
  const waypoints = ordered
    .slice(1, -1)
    .map((point) => `${point.coordinate.latitude.toFixed(6)},${point.coordinate.longitude.toFixed(6)}`)
    .join('|');

  const params = [
    'api=1',
    `origin=${origin.latitude.toFixed(6)},${origin.longitude.toFixed(6)}`,
    `destination=${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)}`,
    waypoints ? `waypoints=${encodeURIComponent(waypoints)}` : '',
  ]
    .filter(Boolean)
    .join('&');

  return `https://www.google.com/maps/dir/?${params}`;
}

function mapRegion(points: MapPoint[], fallback: { latitude: number; longitude: number }): Region {
  if (points.length === 0) {
    return {
      ...fallback,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    };
  }

  const lats = points.map((point) => point.coordinate.latitude);
  const lngs = points.map((point) => point.coordinate.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max((maxLat - minLat) * 1.45, 0.025);
  const lngDelta = Math.max((maxLng - minLng) * 1.45, 0.025);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

function renderField(field: FieldDef, value: any, mapPoints: MapPoint[], currentEntryId: string) {
  if (value === undefined || value === null) return null;

  switch (field.type) {
    case 'image':
      return (
        <PhotoSection
          key={field.id}
          label={field.label}
          photos={Array.isArray(value) ? value : []}
        />
      );
    case 'gps': {
      const isValidLocation =
        value &&
        typeof value === 'object' &&
        Number.isFinite(Number(value.lat)) &&
        Number.isFinite(Number(value.lng));
      return (
        <GpsSection
          key={field.id}
          location={isValidLocation ? value : undefined}
          mapPoints={mapPoints}
          currentEntryId={currentEntryId}
        />
      );
    }
    case 'rating':
      return <RatingSection key={field.id} label={field.label} rating={value ?? 0} max={field.max ?? 5} />;
    case 'boolean':
      return (
        <FieldRow key={field.id} label={field.label}>
          <View style={[styles.boolChip, { backgroundColor: value ? '#EAF6FD' : '#f2dada' }]}>
            <Text style={[styles.boolChipText, { color: value ? '#17689B' : '#7a0010' }]}>
              {value ? 'Yes' : 'No'}
            </Text>
          </View>
        </FieldRow>
      );
    case 'date': {
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        return (
          <FieldRow key={field.id} label={field.label}>
            <Text style={styles.fieldValue}>Invalid date</Text>
          </FieldRow>
        );
      }
      return (
        <FieldRow key={field.id} label={field.label}>
          <Text style={styles.fieldValue}>{formatDate(d.getTime())}</Text>
        </FieldRow>
      );
    }
    case 'select': {
      const text = Array.isArray(value)
        ? value.map(selectValueLabel).join(', ')
        : selectValueLabel(value);
      if (!text.trim()) return null;
      return (
        <FieldRow key={field.id} label={field.label}>
          <Text style={styles.fieldValue}>{text}</Text>
        </FieldRow>
      );
    }
    default:
      if (!String(value).trim()) return null;
      return (
        <FieldRow key={field.id} label={field.label}>
          <Text style={styles.fieldValue}>{String(value)}</Text>
        </FieldRow>
      );
  }
}

function renderLegacyData(data: Record<string, any>, mapPoints: MapPoint[], currentEntryId: string) {
  return Object.entries(data).map(([key, value]) => {
    if (value === null || value === undefined) return null;

    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'lat' in value &&
      'lng' in value
    ) {
      return (
        <GpsSection
          key={key}
          location={value as GpsLocation}
          mapPoints={mapPoints}
          currentEntryId={currentEntryId}
        />
      );
    }

    if (Array.isArray(value) && value.length > 0 && value[0]?.uri) {
      return <PhotoSection key={key} label={prettyKey(key)} photos={value} />;
    }

    if (!String(value).trim()) return null;
    return (
      <FieldRow key={key} label={prettyKey(key)}>
        <Text style={styles.fieldValue}>{String(value)}</Text>
      </FieldRow>
    );
  });
}

function prettyKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function RatingSection({ label, rating, max }: { label: string; rating: number; max: number }) {
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.starsRow}>
        {Array.from({ length: max }).map((_, i) => (
          <MaterialIcons
            key={i}
            name={i < rating ? 'star' : 'star-border'}
            size={22}
            color={i < rating ? '#2589C8' : '#C4D1D8'}
          />
        ))}
        <Text style={styles.ratingNum}>{rating}/{max}</Text>
      </View>
    </View>
  );
}

function GpsSection({
  location,
  mapPoints,
  currentEntryId,
}: {
  location: GpsLocation | undefined;
  mapPoints: MapPoint[];
  currentEntryId: string;
}) {
  const lat = location ? Number(location.lat) : NaN;
  const lng = location ? Number(location.lng) : NaN;
  const hasValidLocation = Number.isFinite(lat) && Number.isFinite(lng);
  const mapUrl = hasValidLocation ? staticMapUrl(lat, lng) : null;
  const [mapFailed, setMapFailed] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const currentCoordinate = { latitude: lat, longitude: lng };
  const initialRegion = useMemo(
    () => mapRegion(mapPoints, currentCoordinate),
    [mapPoints, lat, lng]
  );

  return (
    <View style={styles.gpsCard}>
      <Text style={styles.fieldLabel}>Location</Text>
      <View style={styles.gpsMetaRow}>
        <MaterialIcons name="location-on" size={17} color={colors.brand.primary} />
        <Text style={styles.gpsCoords}>
          {hasValidLocation ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'No location captured'}
        </Text>
      </View>
      {hasValidLocation ? (
        <>
          {location?.address ? (
            <Text style={styles.gpsAddress}>{location.address}</Text>
          ) : null}
          {mapUrl && !mapFailed ? (
            <TouchableOpacity
              style={styles.mapPreview}
              onPress={() => setMapOpen(true)}
              activeOpacity={0.86}
            >
              <Image
                source={{ uri: mapUrl }}
                style={styles.mapImage}
                resizeMode="cover"
                onError={() => setMapFailed(true)}
              />
              <View style={styles.mapOpenHint}>
                <MaterialIcons name="open-in-full" size={14} color={colors.text.inverse} />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.mapPreview, styles.mapPreviewEmpty]}
              onPress={() => setMapOpen(true)}
              activeOpacity={0.86}
            >
              <MaterialIcons name="map" size={30} color={colors.text.muted} />
              <Text style={styles.mapPreviewEmptyText}>
                {mapFailed ? 'Map preview could not load' : 'Tap to open map'}
              </Text>
            </TouchableOpacity>
          )}
          <Modal
            visible={mapOpen}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setMapOpen(false)}
          >
            <View style={styles.mapModalRoot}>
              <View style={styles.mapModalHeader}>
                <View>
                  <Text style={styles.mapModalTitle}>Locations</Text>
                  <Text style={styles.mapModalSubtitle}>{mapPoints.length} points</Text>
                </View>
                <View style={styles.mapModalActions}>
                  <TouchableOpacity
                    style={styles.mapModalActionBtn}
                    onPress={() => Linking.openURL(googleMapsUrl(lat, lng))}
                  >
                    <MaterialIcons name="open-in-new" size={20} color={colors.brand.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.mapModalClose} onPress={() => setMapOpen(false)}>
                    <MaterialIcons name="close" size={22} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              <MapView
                style={styles.interactiveMap}
                provider={PROVIDER_GOOGLE}
                initialRegion={initialRegion}
                mapType="standard"
                loadingEnabled
                loadingBackgroundColor={colors.background.app}
                loadingIndicatorColor={colors.brand.primary}
              >
                {mapPoints.map((point) => (
                  <Marker
                    key={point.id}
                    coordinate={point.coordinate}
                    title={point.title}
                    pinColor={point.id === currentEntryId ? colors.brand.primary : colors.text.secondary}
                  />
                ))}
              </MapView>
              <View style={styles.mapModalFooter}>
                <TouchableOpacity
                  style={styles.openMapsBtn}
                  onPress={() => Linking.openURL(googleMapsPointsUrl(mapPoints, lat, lng))}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="map" size={19} color={colors.text.inverse} />
                  <Text style={styles.openMapsText}>Open in Google Maps</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <Text style={styles.gpsSub}>
            Accuracy{' '}
            {(() => {
              const acc = Number(location?.accuracy);
              return typeof location?.accuracy === 'number' && Number.isFinite(acc)
                ? `+/-${acc.toFixed(1)} m`
                : 'unknown';
            })()}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function PhotoSection({ label, photos }: { label: string; photos: PhotoItem[] }) {
  if (!photos.length) return null;
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{label} ({photos.length})</Text>
      <View style={styles.photoGrid}>
        {photos.map((ph) => (
          <View key={ph.id} style={styles.photoTile}>
            <Image source={{ uri: ph.uri }} style={styles.photoImage} resizeMode="cover" />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7FBFE' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  iconBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  deleteBtn: {
    backgroundColor: '#fdf2f2',
  },
  topLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#171d1b',
    textAlign: 'center',
  },

  notFound: { fontSize: 15, color: '#3f4946', marginTop: 12 },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },

  // Header card
  headerCard: {
    backgroundColor: '#EAF6FD',
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EAF6FD',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  formChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#17689B',
  },
  headerAgo: {
    fontSize: 12,
    color: '#3f4946',
  },
  headerDate: {
    fontSize: 13,
    fontWeight: '500',
    color: '#171d1b',
    marginTop: 4,
  },

  // Field card
  fieldCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3F0F8',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#3f4946',
  },
  fieldValue: {
    fontSize: 15,
    color: '#171d1b',
    lineHeight: 22,
  },

  // Bool chip
  boolChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 100,
  },
  boolChipText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Rating
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingNum: {
    fontSize: 13,
    fontWeight: '500',
    color: '#3f4946',
    marginLeft: 6,
  },

  // GPS
  gpsCard: {
    backgroundColor: colors.background.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    gap: 10,
  },
  gpsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  gpsCoords: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  gpsAddress: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    marginTop: 4,
  },
  gpsSub: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  mapPreview: {
    height: 154,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.background.muted,
    borderWidth: 1,
    borderColor: colors.border.section,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapOpenHint: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay.toast,
  },
  mapPreviewEmpty: {
    backgroundColor: colors.background.fieldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  mapPreviewEmptyText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
    textAlign: 'center',
  },
  mapModalRoot: {
    flex: 1,
    backgroundColor: colors.background.app,
  },
  mapModalHeader: {
    minHeight: 70,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.section,
    backgroundColor: colors.background.white,
  },
  mapModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  mapModalSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  mapModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapModalActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.soft,
  },
  mapModalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.soft,
  },
  interactiveMap: {
    flex: 1,
  },
  mapModalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.section,
    backgroundColor: colors.background.white,
  },
  openMapsBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.brand.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  openMapsText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.inverse,
  },

  // Photos
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoTile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E1EEF7',
  },
  photoImage: { width: '100%', height: '100%' },

  // Footer
  metaFooter: {
    paddingHorizontal: 4,
    paddingTop: 4,
    gap: 4,
  },
  metaRow: {
    fontSize: 12,
  },
  metaKey: {
    color: '#3f4946',
    fontWeight: '500',
  },
  metaMono: {
    color: '#171d1b',
    fontFamily: 'monospace',
  },
});
