import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../store/entriesStore';
import EntryCard from '../components/EntryCard';

export default function EntriesScreen() {
  const insets = useSafeAreaInsets();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnack = useCallback((msg: string) => {
    setSnackbar(msg);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar(null), 2600);
  }, []);

  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  const targetEntry = deleteTarget ? entries.find((e) => e.id === deleteTarget) : null;

  const confirmDelete = () => {
    if (deleteTarget) deleteEntry(deleteTarget);
    setDeleteTarget(null);
    showSnack('Entry deleted');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#171d1b" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>All entries</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/export')}>
          <MaterialIcons name="ios-share" size={23} color="#171d1b" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.countLabel}>
          {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'} · newest first
        </Text>

        {sorted.length === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="inventory" size={46} color="#9fb3ad" />
            <Text style={styles.emptyTitle}>No entries yet</Text>
            <Text style={styles.emptyHint}>Tap "New entry" on the home screen to get started.</Text>
          </View>
        )}

        <View style={styles.cardList}>
          {sorted.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onOpen={() => router.push(`/entry/${entry.id}`)}
              onDelete={() => setDeleteTarget(entry.id)}
              showCoords
            />
          ))}
        </View>
      </ScrollView>

      {/* Snackbar */}
      {snackbar && (
        <View style={[styles.snackbar, { bottom: 24 + insets.bottom }]}>
          <MaterialIcons name="check-circle" size={20} color="#83d5c6" />
          <Text style={styles.snackText}>{snackbar}</Text>
        </View>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <>
          <Pressable style={styles.scrim} onPress={() => setDeleteTarget(null)} />
          <View style={styles.dialogOverlay}>
            <View style={styles.dialog}>
              <MaterialIcons name="delete" size={26} color="#006a60" />
              <Text style={styles.dialogTitle}>Delete entry?</Text>
              <Text style={styles.dialogBody}>
                Entry #{String(targetEntry?.seq ?? '').padStart(2, '0')} —{' '}
                {targetEntry?.data.site_name ?? ''} will be permanently removed.
              </Text>
              <View style={styles.dialogActions}>
                <TouchableOpacity
                  style={styles.dialogBtn}
                  onPress={() => setDeleteTarget(null)}
                >
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
  screenTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '500',
    color: '#171d1b',
    paddingLeft: 4,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  countLabel: {
    fontSize: 12,
    color: '#3f4946',
    fontWeight: '500',
    marginBottom: 12,
    marginTop: 2,
    marginLeft: 2,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#171d1b',
  },
  emptyHint: {
    fontSize: 13,
    color: '#3f4946',
    textAlign: 'center',
  },

  cardList: { gap: 10 },

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
  dialogTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#171d1b',
    marginTop: 14,
  },
  dialogBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#3f4946',
    marginTop: 10,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 22,
  },
  dialogBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100 },
  dialogBtnCancel: { fontSize: 14, fontWeight: '600', color: '#006a60' },
  dialogBtnDelete: { fontSize: 14, fontWeight: '600', color: '#ba1a1a' },

  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2f3330',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 8,
  },
  snackText: { fontSize: 14, color: '#eef1ee', flex: 1 },
});
