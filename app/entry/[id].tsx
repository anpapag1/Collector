import {
  Alert,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../../store/entriesStore';
import { formatDate, timeAgo } from '../../utils/timeUtils';
import { FieldDef, PhotoItem, GpsLocation } from '../../types';
import { selectValueLabel } from '../../utils/formLogic';
import { getEntryDisplayNumbers } from '../../utils/entryNumbering';
import { useMemo } from 'react';

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
          ? fields.map((field) => renderField(field, data[field.id]))
          : renderLegacyData(data)
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

function renderField(field: FieldDef, value: any) {
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
      return <GpsSection key={field.id} location={isValidLocation ? value : undefined} />;
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

function renderLegacyData(data: Record<string, any>) {
  return Object.entries(data).map(([key, value]) => {
    if (value === null || value === undefined) return null;

    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'lat' in value &&
      'lng' in value
    ) {
      return <GpsSection key={key} location={value as GpsLocation} />;
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

function GpsSection({ location }: { location: GpsLocation | undefined }) {
  return (
    <View style={styles.gpsCard}>
      <View style={styles.gpsRow}>
        <View style={styles.gpsIconCircle}>
          <MaterialIcons name="location-on" size={20} color="#2589C8" />
        </View>
        <View style={styles.gpsText}>
          {location ? (
            <>
              <Text style={styles.gpsCoords}>
                {(() => {
                  const lat = Number(location.lat);
                  const lng = Number(location.lng);
                  return Number.isFinite(lat) && Number.isFinite(lng)
                    ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                    : 'unknown';
                })()}
              </Text>
              <Text style={styles.gpsSub}>
                Accuracy{' '}
                {(() => {
                  const acc = Number(location.accuracy);
                  return typeof location.accuracy === 'number' && Number.isFinite(acc)
                    ? `±${acc.toFixed(1)} m`
                    : 'unknown';
                })()}
              </Text>
            </>
          ) : (
            <Text style={styles.gpsSub}>No location captured</Text>
          )}
        </View>
      </View>
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
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3F0F8',
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gpsIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EAF6FD',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gpsText: { flex: 1 },
  gpsCoords: { fontSize: 14, fontWeight: '600', color: '#171d1b' },
  gpsSub: { fontSize: 12, color: '#3f4946', marginTop: 2 },

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
