import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { showDialog } from '../../store/dialogStore';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../../store/entriesStore';
import { formatDate, timeAgo } from '../../utils/timeUtils';
import { FieldDef, PhotoItem, GpsLocation } from '../../types';
import { selectValueLabel } from '../../utils/formLogic';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';
import { getEntryDisplayNumbers } from '../../utils/entryNumbering';
import { colors } from '../../theme/colors';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

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
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);

  const entry = entries.find((e) => e.id === id);
  const displayNumbers = useMemo(() => getEntryDisplayNumbers(entries), [entries]);

  if (!entry) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="inventory" size={40} color={colors.text.muted} />
        <Text style={styles.notFound}>Entry not found</Text>
      </View>
    );
  }

  const { data, createdAt, formTitle, fields } = entry;
  const displayNumber = displayNumbers.get(entry.id) ?? 0;

  const handleDelete = () => {
    showDialog({
      title: 'Delete entry?',
      message: `Entry #${String(displayNumber).padStart(2, '0')} will be permanently removed.`,
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteEntry(entry.id);
            router.back();
          },
        },
      ],
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.topLabel}>Entry #{String(displayNumber).padStart(2, '0')}</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push(`/edit-entry/${entry.id}`)}
        >
          <MaterialIcons name="edit" size={22} color={colors.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, styles.deleteBtn]}
          onPress={handleDelete}
        >
          <MaterialIcons name="delete-outline" size={22} color={colors.text.danger} />
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
                <MaterialIcons name="description" size={13} color={colors.brand.primary} />
                <Text style={styles.formChipText}>{formTitle}</Text>
              </View>
            ) : null}
            <Text style={styles.headerAgo}>{timeAgo(createdAt)}</Text>
          </View>
          <Text style={styles.headerDate}>{formatDate(createdAt)}</Text>
        </View>

        {/* Dynamic fields */}
        {fields
          ? fields.map((field) => renderField(field, data[field.id], entry.id, colors, styles))
          : renderLegacyData(data, entry.id, styles)
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

function renderField(
  field: FieldDef,
  value: any,
  currentEntryId: string,
  colors: AppColors,
  styles: AppStyles,
) {
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
          currentEntryId={currentEntryId}
        />
      );
    }
    case 'rating':
      return <RatingSection key={field.id} label={field.label} rating={value ?? 0} max={field.max ?? 5} />;
    case 'boolean':
      return (
        <FieldRow key={field.id} label={field.label}>
          <View style={[styles.boolChip, { backgroundColor: value ? colors.background.successSoft : colors.background.dangerPale }]}>
            <Text style={[styles.boolChipText, { color: value ? colors.text.brandDark : colors.text.dangerDark }]}>
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

function renderLegacyData(
  data: Record<string, any>,
  currentEntryId: string,
  styles: AppStyles,
) {
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
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function RatingSection({ label, rating, max }: { label: string; rating: number; max: number }) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.starsRow}>
        {Array.from({ length: max }).map((_, i) => (
          <MaterialIcons
            key={i}
            name={i < rating ? 'star' : 'star-border'}
            size={22}
            color={i < rating ? colors.brand.primary : colors.border.ratingEmpty}
          />
        ))}
        <Text style={styles.ratingNum}>{rating}/{max}</Text>
      </View>
    </View>
  );
}

function GpsSection({
  location,
  currentEntryId,
}: {
  location: GpsLocation | undefined;
  currentEntryId: string;
}) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const lat = location ? Number(location.lat) : NaN;
  const lng = location ? Number(location.lng) : NaN;
  const hasValidLocation = Number.isFinite(lat) && Number.isFinite(lng);
  const mapUrl = hasValidLocation ? staticMapUrl(lat, lng) : null;
  const [mapFailed, setMapFailed] = useState(false);
  const openMap = () => router.push(`/map/${currentEntryId}`);

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
              onPress={openMap}
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
              onPress={openMap}
              activeOpacity={0.86}
            >
              <MaterialIcons name="map" size={30} color={colors.text.muted} />
              <Text style={styles.mapPreviewEmptyText}>
                {mapFailed ? 'Map preview could not load' : 'Tap to open map'}
              </Text>
            </TouchableOpacity>
          )}
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
  const styles = useThemedStyles(createStyles);
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

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.app },

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
    backgroundColor: colors.background.dangerSoft,
  },
  topLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },

  notFound: { fontSize: 15, color: colors.text.secondary, marginTop: 12 },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },

  // Header card
  headerCard: {
    backgroundColor: colors.background.elevatedGreen,
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
    backgroundColor: colors.background.elevatedGreen,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  formChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.brandDark,
  },
  headerAgo: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  headerDate: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.primary,
    marginTop: 4,
  },

  // Field card
  fieldCard: {
    backgroundColor: colors.background.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.text.secondary,
  },
  fieldValue: {
    fontSize: 15,
    color: colors.text.primary,
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
    color: colors.text.secondary,
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
    backgroundColor: colors.border.section,
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
    color: colors.text.secondary,
    fontWeight: '500',
  },
  metaMono: {
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
});

type AppStyles = ReturnType<typeof createStyles>;
