import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../../store/entriesStore';
import { timeAgo, formatDate } from '../../utils/timeUtils';
import { PhotoItem } from '../../types';

export default function EntryDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);

  const [deleteDialog, setDeleteDialog] = useState(false);

  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#3f4946' }}>Entry not found.</Text>
      </View>
    );
  }

  const { data, seq, createdAt } = entry;
  const name: string = data.site_name ?? '—';
  const category: string = data.category ?? '';
  const rating: number = data.rating ?? 0;
  const notes: string = data.notes ?? '';
  const photos: PhotoItem[] = data.photo ?? [];
  const location = data.location;

  const confirmDelete = () => {
    deleteEntry(entry.id);
    router.back();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#171d1b" />
        </TouchableOpacity>
        <Text style={styles.topLabel}>Entry #{String(seq).padStart(2, '0')}</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleteDialog(true)}>
          <MaterialIcons name="delete" size={23} color="#171d1b" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Name & meta */}
        <Text style={styles.name}>{name}</Text>
        <View style={styles.metaRow}>
          {!!category && <View style={styles.categoryChip}><Text style={styles.categoryText}>{category}</Text></View>}
          <Text style={styles.ago}>{timeAgo(createdAt)}</Text>
        </View>

        {/* Stars */}
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <MaterialIcons
              key={n}
              name={n <= rating ? 'star' : 'star-border'}
              size={22}
              color={n <= rating ? '#006a60' : '#c6d0cc'}
            />
          ))}
          <Text style={styles.ratingLabel}>{rating}/5</Text>
        </View>

        {/* GPS card */}
        <View style={styles.gpsCard}>
          <LinearGradient
            colors={['#dfe9e5', '#cfe0da']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mapPlaceholder}
          >
            <View style={styles.gridOverlay} />
            <View style={styles.pin}>
              <MaterialIcons name="location-on" size={40} color="#006a60" />
            </View>
          </LinearGradient>
          <View style={styles.gpsBottom}>
            <MaterialIcons name="my-location" size={20} color="#006a60" />
            <View style={styles.gpsText}>
              {location ? (
                <>
                  <Text style={styles.gpsCoords}>
                    {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  </Text>
                  <Text style={styles.gpsAcc}>Accuracy ±{location.accuracy.toFixed(1)} m</Text>
                </>
              ) : (
                <Text style={styles.gpsAcc}>No location captured</Text>
              )}
            </View>
          </View>
        </View>

        {/* Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Photos ({photos.length})</Text>
          {photos.length > 0 ? (
            <View style={styles.photoGrid}>
              {photos.map((ph) => (
                <View key={ph.id} style={styles.photoTile}>
                  <Image source={{ uri: ph.uri }} style={styles.photoImage} resizeMode="cover" />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noPhotos}>
              <Text style={styles.noPhotosText}>No photos attached</Text>
            </View>
          )}
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>{notes || '—'}</Text>
          </View>
        </View>

        {/* Metadata */}
        <View style={styles.metaTable}>
          <View style={styles.metaRow2}>
            <Text style={styles.metaKey}>Created</Text>
            <Text style={styles.metaVal}>{formatDate(createdAt)}</Text>
          </View>
          <View style={styles.metaRow2}>
            <Text style={styles.metaKey}>Entry ID</Text>
            <Text style={[styles.metaVal, styles.mono]}>{entry.id}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Delete dialog */}
      {deleteDialog && (
        <>
          <Pressable style={styles.scrim} onPress={() => setDeleteDialog(false)} />
          <View style={styles.dialogOverlay}>
            <View style={styles.dialog}>
              <MaterialIcons name="delete" size={26} color="#006a60" />
              <Text style={styles.dialogTitle}>Delete entry?</Text>
              <Text style={styles.dialogBody}>
                Entry #{String(seq).padStart(2, '0')} — {name} will be permanently removed.
              </Text>
              <View style={styles.dialogActions}>
                <TouchableOpacity style={styles.dialogBtn} onPress={() => setDeleteDialog(false)}>
                  <Text style={styles.dialogBtnCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dialogBtn} onPress={confirmDelete}>
                  <Text style={styles.dialogBtnDelete}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4fbf8' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#3f4946',
    paddingLeft: 4,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 20,
  },

  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#171d1b',
    lineHeight: 32,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryChip: {
    backgroundColor: '#c5e7ff',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0a3450',
  },
  ago: { fontSize: 12, color: '#3f4946' },

  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3f4946',
    marginLeft: 7,
  },

  // GPS card
  gpsCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cdded7',
    backgroundColor: '#fff',
  },
  mapPlaceholder: {
    height: 120,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 0,
  },
  pin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -40,
  },
  gpsBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    paddingHorizontal: 14,
  },
  gpsText: { flex: 1 },
  gpsCoords: { fontSize: 14, fontWeight: '600', color: '#171d1b' },
  gpsAcc: { fontSize: 12, color: '#3f4946', marginTop: 1 },

  // Photos
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3f4946',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoTile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#c2d2cc',
  },
  photoImage: { width: '100%', height: '100%' },
  noPhotos: {
    backgroundColor: '#eef5f1',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  noPhotosText: { fontSize: 13, color: '#7a847f' },

  // Notes
  notesBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2ebe7',
    borderRadius: 14,
    padding: 14,
  },
  notesText: { fontSize: 14, lineHeight: 21, color: '#171d1b' },

  // Metadata table
  metaTable: { gap: 6, paddingHorizontal: 2 },
  metaRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaKey: { fontSize: 12, color: '#3f4946' },
  metaVal: { fontSize: 12, color: '#171d1b' },
  mono: { fontFamily: 'monospace' },

  // Dialog
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
    zIndex: 32,
  },
  dialogOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 33,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  dialog: {
    backgroundColor: '#eef5f1',
    borderRadius: 28,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  dialogTitle: { fontSize: 20, fontWeight: '500', color: '#171d1b', marginTop: 14 },
  dialogBody: { fontSize: 14, lineHeight: 21, color: '#3f4946', marginTop: 10 },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 22,
  },
  dialogBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100 },
  dialogBtnCancel: { fontSize: 14, fontWeight: '600', color: '#006a60' },
  dialogBtnDelete: { fontSize: 14, fontWeight: '600', color: '#ba1a1a' },
});
