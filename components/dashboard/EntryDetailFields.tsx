import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef, PhotoItem, GpsLocation, Entry } from '../../types';
import { selectValueLabel } from '../../utils/formLogic';
import { formatDate } from '../../utils/timeUtils';
import { AppColors, colors as lightPalette } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

// Shared read-only entry field rendering, extracted from app/entry/[id].tsx
// so both the native entry-detail screen and the web dashboard's entry
// detail view render field values identically instead of maintaining two
// copies of the same switch-on-field-type logic.
//
// The two platforms differ only in two respects, both taken as props:
//  - `onOpenMap`: native pushes the in-app native map screen; web should
//    navigate to the web dashboard's map route instead.
//  - `resolvePhotoUri`: native's synced photo `uri` is already a local file
//    path usable directly in <Image>. Web has no local filesystem, so it
//    must resolve a signed URL on demand (utils/photoUrls.ts) — pass a
//    resolver here and photos render a loading state until it settles.
//    Omit it (native) to use `photo.uri` as-is, synchronously.

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

function staticMapUrl(lat: number, lng: number) {
  if (GOOGLE_MAPS_API_KEY) {
    const center = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const markerColor = lightPalette.brand.primary.replace('#', '0x');
    const marker = encodeURIComponent(`color:${markerColor}|${center}`);
    return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=15&size=640x260&scale=2&maptype=roadmap&markers=${marker}&key=${GOOGLE_MAPS_API_KEY}`;
  }

  if (!MAPBOX_TOKEN) return null;

  const markerColor = lightPalette.brand.primary.replace('#', '');
  const marker = `pin-s+${markerColor}(${lng.toFixed(6)},${lat.toFixed(6)})`;
  const center = `${lng.toFixed(6)},${lat.toFixed(6)},15,0`;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${center}/640x260@2x?access_token=${MAPBOX_TOKEN}`;
}

function prettyKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export type EntryDetailFieldsProps = {
  entry: Pick<Entry, 'id' | 'data' | 'fields'>;
  onOpenMap: (entryId: string) => void;
  resolvePhotoUri?: (photo: PhotoItem) => Promise<string | null>;
};

export default function EntryDetailFields({ entry, onOpenMap, resolvePhotoUri }: EntryDetailFieldsProps) {
  const { data, fields, id } = entry;
  if (fields) {
    return (
      <>
        {fields.map((field) =>
          renderField(field, data[field.id], id, onOpenMap, resolvePhotoUri)
        )}
      </>
    );
  }
  return <>{renderLegacyData(data, id, onOpenMap, resolvePhotoUri)}</>;
}

function renderField(
  field: FieldDef,
  value: any,
  entryId: string,
  onOpenMap: (entryId: string) => void,
  resolvePhotoUri?: (photo: PhotoItem) => Promise<string | null>,
) {
  if (value === undefined || value === null) return null;

  switch (field.type) {
    case 'image':
      return (
        <PhotoSection
          key={field.id}
          label={field.label}
          photos={Array.isArray(value) ? value : []}
          resolvePhotoUri={resolvePhotoUri}
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
          onOpenMap={() => onOpenMap(entryId)}
        />
      );
    }
    case 'rating':
      return <RatingSection key={field.id} label={field.label} rating={value ?? 0} max={field.max ?? 5} />;
    case 'boolean':
      return <BooleanRow key={field.id} label={field.label} value={value} />;
    case 'date': {
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        return (
          <FieldRow key={field.id} label={field.label}>
            <PlainValue value="Invalid date" />
          </FieldRow>
        );
      }
      return (
        <FieldRow key={field.id} label={field.label}>
          <PlainValue value={formatDate(d.getTime())} />
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
          <PlainValue value={text} />
        </FieldRow>
      );
    }
    default:
      if (!String(value).trim()) return null;
      return (
        <FieldRow key={field.id} label={field.label}>
          <PlainValue value={String(value)} />
        </FieldRow>
      );
  }
}

function renderLegacyData(
  data: Record<string, any>,
  entryId: string,
  onOpenMap: (entryId: string) => void,
  resolvePhotoUri?: (photo: PhotoItem) => Promise<string | null>,
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
          onOpenMap={() => onOpenMap(entryId)}
        />
      );
    }

    if (Array.isArray(value) && value.length > 0 && value[0]?.uri) {
      return <PhotoSection key={key} label={prettyKey(key)} photos={value} resolvePhotoUri={resolvePhotoUri} />;
    }

    if (!String(value).trim()) return null;
    return (
      <FieldRow key={key} label={prettyKey(key)}>
        <PlainValue value={String(value)} />
      </FieldRow>
    );
  });
}

function PlainValue({ value }: { value: string }) {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.fieldValue}>{value}</Text>;
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

function BooleanRow({ label, value }: { label: string; value: boolean }) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  return (
    <FieldRow label={label}>
      <View style={[styles.boolChip, { backgroundColor: value ? colors.background.successSoft : colors.background.dangerPale }]}>
        <Text style={[styles.boolChipText, { color: value ? colors.text.brandDark : colors.text.dangerDark }]}>
          {value ? 'Yes' : 'No'}
        </Text>
      </View>
    </FieldRow>
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
  onOpenMap,
}: {
  location: GpsLocation | undefined;
  onOpenMap: () => void;
}) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const lat = location ? Number(location.lat) : NaN;
  const lng = location ? Number(location.lng) : NaN;
  const hasValidLocation = Number.isFinite(lat) && Number.isFinite(lng);
  const mapUrl = hasValidLocation ? staticMapUrl(lat, lng) : null;
  const [mapFailed, setMapFailed] = useState(false);

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
              onPress={onOpenMap}
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
              onPress={onOpenMap}
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

function PhotoSection({
  label,
  photos,
  resolvePhotoUri,
}: {
  label: string;
  photos: PhotoItem[];
  resolvePhotoUri?: (photo: PhotoItem) => Promise<string | null>;
}) {
  const styles = useThemedStyles(createStyles);
  if (!photos.length) return null;
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{label} ({photos.length})</Text>
      <View style={styles.photoGrid}>
        {photos.map((ph) => (
          <PhotoTile key={ph.id} photo={ph} resolvePhotoUri={resolvePhotoUri} />
        ))}
      </View>
    </View>
  );
}

function PhotoTile({
  photo,
  resolvePhotoUri,
}: {
  photo: PhotoItem;
  resolvePhotoUri?: (photo: PhotoItem) => Promise<string | null>;
}) {
  const styles = useThemedStyles(createStyles);
  const colors = useAppColors();
  const [uri, setUri] = useState<string | null>(resolvePhotoUri ? null : photo.uri ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!resolvePhotoUri) return;
    let cancelled = false;
    resolvePhotoUri(photo).then((resolved) => {
      if (cancelled) return;
      if (resolved) setUri(resolved);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [photo, resolvePhotoUri]);

  return (
    <View style={styles.photoTile}>
      {uri ? (
        <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <View style={[styles.photoImage, { alignItems: 'center', justifyContent: 'center' }]}>
          <MaterialIcons name={failed ? 'broken-image' : 'image'} size={20} color={colors.text.muted} />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
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
});
