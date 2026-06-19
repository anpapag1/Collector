import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useFormStore } from '../store/formStore';
import { useEntriesStore } from '../store/entriesStore';
import EntryCard from '../components/EntryCard';
import { timeAgo } from '../utils/timeUtils';
import { loadFromPath } from '../utils/schemaLoader';

const PRESETS = [
  { title: 'Site Survey — Municipality X', sub: '6 fields' },
  { title: 'Tree Inventory', sub: '5 fields' },
  { title: 'Accessibility Audit', sub: '8 fields' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const schema = useFormStore((s) => s.schema);
  const loadSchema = useFormStore((s) => s.loadSchema);
  const entries = useEntriesStore((s) => s.entries);

  const [sheet, setSheet] = useState<'config' | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formTitle = activeTitle ?? schema?.formTitle ?? '—';
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  const recent = sorted.slice(0, 5);
  const total = entries.length;
  const lastLabel = total
    ? `Last entry ${timeAgo(sorted[0].createdAt)}`
    : 'No entries yet';

  const showSnack = useCallback((msg: string) => {
    setSnackbar(msg);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar(null), 2600);
  }, []);

  const pickPreset = (title: string) => {
    setActiveTitle(title);
    setSheet(null);
    showSnack('Form loaded');
  };

  const browseFiles = async () => {
    setSheet(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const config = await loadFromPath(result.assets[0].uri);
      loadSchema(config);
      setActiveTitle(null);
      showSnack(`Loaded: ${config.formTitle}`);
    } catch (e: any) {
      showSnack(e?.message ?? 'Invalid config file');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <View style={styles.logoBox}>
            <MaterialIcons name="layers" size={20} color="#fff" />
          </View>
          <Text style={styles.appTitle}>Collector</Text>
        </View>
        <View style={styles.topRight}>
          <TouchableOpacity style={styles.pill} onPress={() => router.push('/entries')}>
            <MaterialIcons name="list-alt" size={18} color="#06201b" />
            <Text style={styles.pillText}>Entries</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pill} onPress={() => router.push('/export')}>
            <MaterialIcons name="ios-share" size={18} color="#06201b" />
            <Text style={styles.pillText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Body ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Active form button */}
        <TouchableOpacity style={styles.formBtn} onPress={() => setSheet('config')}>
          <MaterialIcons name="description" size={22} color="#006a60" />
          <View style={styles.formBtnBody}>
            <Text style={styles.formLabel}>Active form</Text>
            <Text style={styles.formTitle} numberOfLines={1}>{formTitle}</Text>
          </View>
          <MaterialIcons name="settings" size={22} color="#3f4946" />
        </TouchableOpacity>

        {/* Hero card */}
        <LinearGradient
          colors={['#006a60', '#0a8b7c', '#2f9b6e']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroBubble1} />
          <View style={styles.heroBubble2} />
          <Text style={styles.heroLabel}>Total entries collected</Text>
          <View style={styles.heroCount}>
            <Text style={styles.heroNumber}>{total}</Text>
            <MaterialIcons name="storage" size={26} color="rgba(255,255,255,0.85)" style={{ marginBottom: 12 }} />
          </View>
          <View style={styles.heroMeta}>
            <MaterialIcons name="schedule" size={18} color="rgba(255,255,255,0.92)" />
            <Text style={styles.heroMetaText}>{lastLabel}</Text>
          </View>
        </LinearGradient>

        {/* Last entries header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Last entries</Text>
          <TouchableOpacity onPress={() => router.push('/entries')}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {/* Empty state */}
        {total === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="inventory" size={46} color="#9fb3ad" />
            <Text style={styles.emptyTitle}>No entries yet</Text>
            <Text style={styles.emptyHint}>Tap "New entry" to collect your first record.</Text>
          </View>
        )}

        {/* Entry cards */}
        {total > 0 && (
          <View style={styles.cardList}>
            {recent.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onOpen={() => router.push(`/entry/${entry.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── FAB ── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/collect')}
        activeOpacity={0.85}
      >
        <MaterialIcons name="add" size={24} color="#fff" />
        <Text style={styles.fabText}>New entry</Text>
      </TouchableOpacity>

      {/* ── Scrim ── */}
      {sheet && (
        <Pressable style={styles.scrim} onPress={() => setSheet(null)} />
      )}

      {/* ── Config sheet ── */}
      {sheet === 'config' && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Load form config</Text>
            <Text style={styles.sheetSub}>Swap the schema this app collects against</Text>
          </View>
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p.title}
              style={styles.sheetItem}
              onPress={() => pickPreset(p.title)}
            >
              <MaterialIcons name="description" size={22} color="#006a60" />
              <View style={styles.sheetItemBody}>
                <Text style={styles.sheetItemTitle}>{p.title}</Text>
                <Text style={styles.sheetItemSub}>{p.sub}</Text>
              </View>
              {formTitle === p.title && (
                <MaterialIcons name="check-circle" size={22} color="#006a60" />
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.sheetItem, styles.sheetDivider]} onPress={browseFiles}>
            <MaterialIcons name="folder-open" size={22} color="#3f4946" />
            <Text style={styles.sheetItemTitle}>Browse device files…</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Snackbar ── */}
      {snackbar && (
        <View style={[styles.snackbar, { bottom: 84 + insets.bottom }]}>
          <MaterialIcons name="check-circle" size={20} color="#83d5c6" />
          <Text style={styles.snackText}>{snackbar}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f4fbf8',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 6,
    gap: 8,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#006a60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '500',
    color: '#171d1b',
    letterSpacing: 0.2,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#cce8e1',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#06201b',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
    gap: 16,
  },

  // Active form button
  formBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eef5f1',
    borderWidth: 1,
    borderColor: '#d3e0db',
    borderRadius: 16,
    padding: 12,
    paddingHorizontal: 14,
  },
  formBtnBody: {
    flex: 1,
    minWidth: 0,
  },
  formLabel: {
    fontSize: 10.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#3f4946',
    fontWeight: '600',
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#171d1b',
  },

  // Hero
  hero: {
    borderRadius: 28,
    padding: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  heroBubble1: {
    position: 'absolute',
    right: -34,
    top: -34,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  heroBubble2: {
    position: 'absolute',
    right: 40,
    bottom: -50,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.92)',
  },
  heroCount: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  heroNumber: {
    fontSize: 64,
    fontWeight: '700',
    lineHeight: 64,
    color: '#fff',
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 18,
  },
  heroMetaText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#171d1b',
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '600',
    color: '#006a60',
  },

  // Empty
  empty: {
    alignItems: 'center',
    paddingVertical: 44,
    paddingHorizontal: 20,
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

  // Cards
  cardList: {
    gap: 10,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 22,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 26,
    paddingVertical: 18,
    backgroundColor: '#006a60',
    borderRadius: 20,
    shadowColor: '#004840',
    shadowOpacity: 0.42,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  fabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  // Scrim
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
    zIndex: 30,
  },

  // Sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 31,
    backgroundColor: '#f4fbf8',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  sheetHandle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#c2cfca',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    paddingHorizontal: 22,
    paddingBottom: 6,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#171d1b',
  },
  sheetSub: {
    fontSize: 13,
    color: '#3f4946',
    marginTop: 2,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 8,
    borderRadius: 14,
  },
  sheetDivider: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#e2ebe7',
    borderRadius: 0,
    marginHorizontal: 0,
    paddingHorizontal: 22,
  },
  sheetItemBody: {
    flex: 1,
    minWidth: 0,
  },
  sheetItemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#171d1b',
  },
  sheetItemSub: {
    fontSize: 12,
    color: '#3f4946',
    marginTop: 1,
  },

  // Snackbar
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
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  snackText: {
    fontSize: 14,
    color: '#eef1ee',
  },
});
