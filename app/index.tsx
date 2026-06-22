import { useState, useRef, useCallback } from 'react';
import {
  Alert,
  Platform,
  View,
  Text,
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
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StorageAccessFramework, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { Swipeable, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import CollectorLogo from '../assets/Collector_Logo.svg';
import { useFormStore } from '../store/formStore';
import { useEntriesStore } from '../store/entriesStore';
import { usePickerStore } from '../store/pickerStore';
import EntryCard from '../components/EntryCard';
import Toast from '../components/Toast';
import { FormConfig } from '../types';
import { timeAgo } from '../utils/timeUtils';
import { loadBundledConfig, loadFromPath } from '../utils/schemaLoader';

type FormPreset = {
  id: string;
  config: FormConfig;
  custom?: boolean;
};

const INITIAL_PRESETS: FormPreset[] = [
  { id: 'template', config: loadBundledConfig() },
  // add assets\Erwtimatologio_simiou.json to presets for testing import
  { id: 'erwtimatologio', config: require('../assets/Erwtimatologio_simiou.json') as FormConfig },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const schema = useFormStore((s) => s.schema);
  const loadSchema = useFormStore((s) => s.loadSchema);
  const clearSchema = useFormStore((s) => s.clearSchema);
  const entries = useEntriesStore((s) => s.entries);
  const clearEntries = useEntriesStore((s) => s.clearEntries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);
  const hiddenPresetIds = usePickerStore((s) => s.hiddenPresetIds);
  const hidePreset = usePickerStore((s) => s.hidePreset);
  const customForms = usePickerStore((s) => s.customForms);
  const addCustomForm = usePickerStore((s) => s.addCustomForm);
  const removeCustomForm = usePickerStore((s) => s.removeCustomForm);
  const activePresetId = usePickerStore((s) => s.activePresetId);
  const setActivePresetId = usePickerStore((s) => s.setActivePresetId);

  const [sheet, setSheet] = useState<'config' | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeFormRefs = useRef<Map<string, Swipeable>>(new Map());
  const heroSwipeRef = useRef<Swipeable>(null);
  const entrySwipeRefs = useRef<Map<string, Swipeable>>(new Map());

  const customPresets: FormPreset[] = customForms
    .filter(({ config }) => config?.formTitle && config?.fields)
    .map(({ importId, config }) => ({
      id: importId,
      config,
      custom: true,
    }));
  const presets = [...INITIAL_PRESETS, ...customPresets].filter(
    (preset) => !hiddenPresetIds.includes(preset.id),
  );
  const formTitle = schema?.formTitle ?? '—';
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  const recent = sorted.slice(0, 3);
  const total = entries.length;
  const lastLabel = total
    ? `Last entry ${timeAgo(sorted[0].createdAt)}`
    : 'No entries yet';

  const showSnack = useCallback((msg: string) => {
    setSnackbar(msg);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar(null), 2600);
  }, []);

  const closeSwipe = (id: string) => {
    swipeFormRefs.current.get(id)?.close();
  };

  const handleDeleteEntry = useCallback(
    (id: string) => {
      entrySwipeRefs.current.get(id)?.close();
      deleteEntry(id);
      showSnack('Entry deleted');
    },
    [deleteEntry, showSnack],
  );

  const renderEntryRightActions = (
    id: string,
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDeleteEntry(id)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="delete" size={24} color="#fff" />
          <Text style={styles.deleteLabel}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const pickPreset = (preset: FormPreset) => {
    loadSchema(preset.config);
    setActivePresetId(preset.id);
    setSheet(null);
  };

  const deletePreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    closeSwipe(presetId);

    Alert.alert(
      'Delete form?',
      `${preset.config.formTitle} will be removed from this list.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => closeSwipe(presetId) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const deletedFormId = preset.config.formId;
            if (preset.custom) {
              removeCustomForm(presetId);
            } else {
              hidePreset(presetId);
            }
            const remaining = presets.filter((item) => item.id !== presetId);
            if (remaining.length === 0) {
              clearSchema();
              setActivePresetId(null);
              showSnack('No forms left — import a form to continue');
            } else if (activePresetId === presetId) {
              loadSchema(remaining[0].config);
              setActivePresetId(remaining[0].id);
            }
          },
        },
      ],
    );
  };

  const downloadPreset = async (preset: FormPreset) => {
    closeSwipe(preset.id);
    try {
      const json = JSON.stringify(preset.config, null, 2);
      const fileName = `${preset.config.formTitle.replace(/\s+/g, '_')}.json`;

      if (Platform.OS === 'android') {
        const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return;
        const uri = await StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          fileName,
          'application/json',
        );
        await writeAsStringAsync(uri, json, { encoding: EncodingType.UTF8 });
        showSnack(`Saved as ${fileName}`);
      } else {
        const file = new File(Paths.cache, fileName);
        file.write(json);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
      }
    } catch (e: any) {
      showSnack(e?.message ?? 'Export failed');
    }
  };

  const renderFormRightActions = (
    preset: FormPreset,
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [168, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.formActions, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.downloadFormBtn}
          onPress={() => downloadPreset(preset)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="download" size={20} color="#fff" />
          <Text style={styles.actionLabel}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteFormBtn}
          onPress={() => deletePreset(preset.id)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="delete" size={20} color="#fff" />
          <Text style={styles.actionLabel}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const handleDeleteAll = () => {
    heroSwipeRef.current?.close();
    if (total === 0) { showSnack('No entries to delete'); return; }
    Alert.alert(
      'Delete all entries?',
      `This will permanently remove all ${total} ${total === 1 ? 'entry' : 'entries'} and reset the counter to zero.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => heroSwipeRef.current?.close() },
        { text: 'Delete all', style: 'destructive', onPress: () => { clearEntries(); showSnack('All entries deleted'); } },
      ],
    );
  };

  const renderHeroLeftActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-104, 0], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.heroAction, styles.heroActionLeft, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={[styles.heroActionBtn, { backgroundColor: '#006a60' }]}
          onPress={() => { heroSwipeRef.current?.close(); router.push('/export'); }}
          activeOpacity={0.8}
        >
          <MaterialIcons name="ios-share" size={22} color="#fff" />
          <Text style={styles.heroActionLabel}>Export</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderHeroRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [104, 0], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.heroAction, styles.heroActionRight, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={[styles.heroActionBtn, { backgroundColor: '#a1161f' }]}
          onPress={handleDeleteAll}
          activeOpacity={0.8}
        >
          <MaterialIcons name="delete-sweep" size={22} color="#fff" />
          <Text style={styles.heroActionLabel}>Delete all</Text>
        </TouchableOpacity>
      </Animated.View>
    );
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
      const importId = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      addCustomForm(config, importId);
      loadSchema(config);
      setActivePresetId(importId);
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
            <CollectorLogo width={30} height={30} />
          </View>
          <Text style={styles.appTitle}>Collector</Text>
        </View>
      </View>

      {/* ── Body ── */}
      <View style={styles.body}>
        {/* Active form button */}
        <TouchableOpacity
          style={[styles.formBtn, !schema && styles.formBtnEmpty]}
          onPress={() => setSheet('config')}
        >
          <MaterialIcons
            name={schema ? 'description' : 'file-present'}
            size={22}
            color={schema ? '#006a60' : '#9fb3ad'}
          />
          <View style={styles.formBtnBody}>
            <Text style={styles.formLabel}>Active form</Text>
            {schema ? (
              <Text style={styles.formTitle} numberOfLines={1}>{formTitle}</Text>
            ) : (
              <Text style={styles.formTitleEmpty}>No form loaded</Text>
            )}
          </View>
          <MaterialIcons name="settings" size={22} color={schema ? '#3f4946' : '#9fb3ad'} />
        </TouchableOpacity>

        {/* Hero card */}
        <Swipeable
          ref={heroSwipeRef}
          renderLeftActions={renderHeroLeftActions}
          renderRightActions={renderHeroRightActions}
          overshootLeft={false}
          overshootRight={false}
          friction={2}
        >
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
        </Swipeable>

        {/* Latest entries header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Latest entries</Text>
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
              <Swipeable
                key={entry.id}
                ref={(ref) => {
                  if (ref) entrySwipeRefs.current.set(entry.id, ref);
                  else entrySwipeRefs.current.delete(entry.id);
                }}
                renderRightActions={(progress) => renderEntryRightActions(entry.id, progress)}
                overshootRight={false}
                friction={2}
              >
                <EntryCard
                  entry={entry}
                  onOpen={() => router.push(`/entry/${entry.id}`)}
                />
              </Swipeable>
            ))}
          </View>
        )}
      </View>

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[styles.fab, !schema && styles.fabDisabled]}
        onPress={() => {
          if (!schema) {
            showSnack('Load a form first to collect entries');
            setSheet('config');
            return;
          }
          router.push('/collect');
        }}
        activeOpacity={schema ? 0.85 : 1}
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
            <Text style={styles.sheetSub}>Tap to load · swipe left to save or delete</Text>
          </View>
          <GHScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {presets.length > 0 ? (
              presets.map((preset) => {
                const isActive = preset.id === activePresetId;
                return (
                  <Swipeable
                    key={preset.id}
                    ref={(ref) => {
                      if (ref) swipeFormRefs.current.set(preset.id, ref);
                      else swipeFormRefs.current.delete(preset.id);
                    }}
                    renderRightActions={(progress) =>
                      renderFormRightActions(preset, progress)
                    }
                    overshootRight={false}
                    friction={2}
                  >
                    <TouchableOpacity
                      style={[styles.sheetItem, isActive && styles.sheetItemActive]}
                      onPress={() => pickPreset(preset)}
                      activeOpacity={0.78}
                    >
                      <MaterialIcons name="description" size={22} color="#006a60" />
                      <View style={styles.sheetItemBody}>
                        <Text style={styles.sheetItemTitle}>{preset.config.formTitle}</Text>
                        <Text style={styles.sheetItemSub}>
                          {preset.config.fields.length} fields
                        </Text>
                      </View>
                      {isActive && <MaterialIcons name="check-circle" size={22} color="#006a60" />}
                    </TouchableOpacity>
                  </Swipeable>
                );
              })
            ) : (
              <View style={styles.emptyForms}>
                <MaterialIcons name="delete-forever" size={34} color="#9fb3ad" />
                <Text style={styles.emptyFormsTitle}>No saved forms</Text>
                <Text style={styles.emptyFormsHint}>Use device files to load a new form config.</Text>
              </View>
            )}
            <TouchableOpacity style={[styles.sheetItem, styles.sheetDivider]} onPress={browseFiles}>
              <MaterialIcons name="folder-open" size={22} color="#3f4946" />
              <Text style={styles.sheetItemTitle}>Browse device files…</Text>
            </TouchableOpacity>
          </GHScrollView>
        </View>
      )}

      <Toast
        message={snackbar}
        onDismiss={() => setSnackbar(null)}
        bottom={84 + insets.bottom}
        icon={snackbar?.startsWith('No forms') ? 'info-outline' : 'check-circle'}
      />
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
  body: {
    flex: 1,
    padding: 16,
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
  formBtnEmpty: {
    borderColor: '#c2cfca',
    backgroundColor: '#f0f4f2',
  },
  formTitleEmpty: {
    fontSize: 15,
    fontWeight: '400',
    color: '#9fb3ad',
    fontStyle: 'italic',
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
  heroAction: {
    width: 96,
    alignItems: 'stretch',
    marginVertical: 2,
  },
  heroActionLeft: {
    marginRight: 8,
  },
  heroActionRight: {
    marginLeft: 8,
  },
  heroActionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 24,
  },
  heroActionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
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

  deleteAction: {
    width: 88,
    justifyContent: 'center',
    alignItems: 'stretch',
    marginLeft: 6,
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#a1161f',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
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
  fabDisabled: {
    backgroundColor: '#9fb3ad',
    shadowOpacity: 0.12,
    elevation: 3,
  },

  // Scrim
  scrim: {
    ...StyleSheet.absoluteFill,
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
    maxHeight: '82%',
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
    backgroundColor: '#f4fbf8',
  },
  sheetItemActive: {
    backgroundColor: '#e6f3ef',
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

  // Swipe actions
  formActions: {
    width: 160,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginLeft: 6,
    gap: 6,
    paddingRight: 8,
    paddingVertical: 2,
  },
  downloadFormBtn: {
    flex: 1,
    backgroundColor: '#006a60',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteFormBtn: {
    flex: 1,
    backgroundColor: '#a1161f',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },

  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingBottom: 12,
  },
  emptyForms: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyFormsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#171d1b',
  },
  emptyFormsHint: {
    fontSize: 12.5,
    color: '#3f4946',
    textAlign: 'center',
    paddingHorizontal: 24,
  },

});
