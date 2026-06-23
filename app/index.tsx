import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
import { loadBundledConfig, loadFromPath } from '../utils/schemaLoader';

type FormPreset = {
  id: string;
  config: FormConfig;
  custom?: boolean;
};

const INITIAL_PRESETS: FormPreset[] = [
  { id: 'template', config: loadBundledConfig() },
];

const SNACKBAR_TIMEOUT_MS = 2600;
const BOTTOM_BAR_HEIGHT = 84;
const ENTRY_SWIPE_ACTION_WIDTH = 80;
const FORM_SWIPE_ACTION_WIDTH = 168;
const ACTIVE_FORM_SWIPE_ACTION_WIDTH = 104;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const schema = useFormStore((s) => s.schema);
  const loadSchema = useFormStore((s) => s.loadSchema);
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
  const activeFormSwipeRef = useRef<Swipeable>(null);
  const swipeFormRefs = useRef<Map<string, Swipeable>>(new Map());
  const entrySwipeRefs = useRef<Map<string, Swipeable>>(new Map());

  const customPresets: FormPreset[] = useMemo(
    () =>
      customForms
        .filter(({ config }) => config?.formTitle && config?.fields)
        .map(({ importId, config }) => ({
          id: importId,
          config,
          custom: true,
        })),
    [customForms],
  );
  const malformedCustomFormCount = customForms.length - customPresets.length;
  const presets = useMemo(
    () =>
      [...INITIAL_PRESETS, ...customPresets].filter(
        (preset) => !hiddenPresetIds.includes(preset.id),
      ),
    [customPresets, hiddenPresetIds],
  );
  const formTitle = useMemo(() => schema?.formTitle ?? '—', [schema]);
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.createdAt - a.createdAt),
    [entries],
  );
  const recent = useMemo(() => sorted.slice(0, 3), [sorted]);
  const total = useMemo(() => entries.length, [entries]);

  const showSnack = useCallback((msg: string) => {
    setSnackbar(msg);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar(null), SNACKBAR_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (malformedCustomFormCount > 0) {
      showSnack(
        `${malformedCustomFormCount} saved form${malformedCustomFormCount === 1 ? '' : 's'} could not be loaded.`,
      );
    }
  }, [malformedCustomFormCount, showSnack]);

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
      outputRange: [ENTRY_SWIPE_ACTION_WIDTH, 0],
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
            if (preset.custom) {
              removeCustomForm(presetId);
            } else {
              hidePreset(presetId);
            }

            // Read live store state instead of the closed-over `presets`/`activePresetId`
            // variables, which may be stale by the time this async alert callback fires.
            const pickerState = usePickerStore.getState();
            const liveCustomPresets: FormPreset[] = pickerState.customForms
              .filter(({ config }) => config?.formTitle && config?.fields)
              .map(({ importId, config }) => ({ id: importId, config, custom: true }));
            const liveRemaining = [...INITIAL_PRESETS, ...liveCustomPresets].filter(
              (item) => !pickerState.hiddenPresetIds.includes(item.id) && item.id !== presetId,
            );

            if (liveRemaining.length === 0) {
              useFormStore.getState().clearSchema();
              usePickerStore.getState().setActivePresetId(null);
              showSnack('No forms left — import a form to continue');
            } else if (pickerState.activePresetId === presetId) {
              useFormStore.getState().loadSchema(liveRemaining[0].config);
              usePickerStore.getState().setActivePresetId(liveRemaining[0].id);
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
      const fileName = `${preset.config.formTitle.replace(/[\s/\\:*?"<>|]+/g, '_')}.json`;

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
    } catch (e) {
      showSnack(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const renderFormRightActions = (
    preset: FormPreset,
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [FORM_SWIPE_ACTION_WIDTH, 0],
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

  const handleDeleteAllEntries = () => {
    activeFormSwipeRef.current?.close();
    if (total === 0) {
      showSnack('No entries to delete');
      return;
    }

    Alert.alert(
      'Delete all entries?',
      `This will permanently remove all ${total} ${total === 1 ? 'entry' : 'entries'}.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => activeFormSwipeRef.current?.close() },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            clearEntries();
            showSnack('All entries deleted');
          },
        },
      ],
    );
  };

  const renderActiveFormLeftActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [-ACTIVE_FORM_SWIPE_ACTION_WIDTH, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.activeFormAction, styles.activeFormActionLeft, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={[styles.activeFormActionBtn, styles.activeFormExportBtn]}
          onPress={() => {
            activeFormSwipeRef.current?.close();
            router.push('/export');
          }}
          activeOpacity={0.8}
        >
          <MaterialIcons name="ios-share" size={21} color="#fff" />
          <Text style={styles.actionLabel}>Export</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderActiveFormRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [ACTIVE_FORM_SWIPE_ACTION_WIDTH, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.activeFormAction, styles.activeFormActionRight, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={[styles.activeFormActionBtn, styles.activeFormDeleteBtn]}
          onPress={handleDeleteAllEntries}
          activeOpacity={0.8}
        >
          <MaterialIcons name="delete-sweep" size={21} color="#fff" />
          <Text style={styles.actionLabel}>Delete</Text>
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
    } catch (e) {
      showSnack(e instanceof Error ? e.message : 'Invalid config file');
    }
  };

  return (
    <View style={styles.root}>

      {/* ── Body ── */}
      <View style={[styles.body, { paddingBottom: insets.bottom + 104 }]}>
        {/* Hero header */}
        <LinearGradient
          colors={['#17689B', '#2589C8', '#62B3E5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 18 }]}
        >
          <View style={styles.heroBubble1} />
          <View style={styles.heroBubble2} />
          <TouchableOpacity
            style={[styles.heroSettingsBtn, { top: insets.top + 18 }]}
            onPress={() => setSheet('config')}
            activeOpacity={0.78}
          >
            <MaterialIcons name="settings" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroBrand}>
            <View style={styles.heroLogoMark}>
              <CollectorLogo width={34} height={34} />
            </View>
            <Text style={styles.heroTitle}>Collector</Text>
          </View>
        </LinearGradient>

        {/* Active form button */}
        <Swipeable
          ref={activeFormSwipeRef}
          renderLeftActions={renderActiveFormLeftActions}
          renderRightActions={renderActiveFormRightActions}
          overshootLeft={false}
          overshootRight={false}
          friction={2}
        >
          <TouchableOpacity
            style={[styles.formBtn, !schema && styles.formBtnEmpty]}
            onPress={() => setSheet('config')}
          >
            <MaterialIcons
              name={schema ? 'description' : 'file-present'}
              size={20}
              color={schema ? '#2589C8' : '#8EA8B8'}
            />
            <View style={styles.formBtnBody}>
              <Text style={styles.formLabel}>Active form</Text>
              {schema ? (
                <Text style={styles.formTitle} numberOfLines={1}>{formTitle}</Text>
              ) : (
                <Text style={styles.formTitleEmpty}>No form loaded</Text>
              )}
            </View>
            <MaterialIcons name="settings" size={20} color={schema ? '#3f4946' : '#8EA8B8'} />
          </TouchableOpacity>
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
            <MaterialIcons name="inventory" size={46} color="#8EA8B8" />
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
        style={[styles.fab, { bottom: insets.bottom + 22 }, !schema && styles.fabDisabled]}
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
                      <MaterialIcons name="description" size={22} color="#2589C8" />
                      <View style={styles.sheetItemBody}>
                        <Text style={styles.sheetItemTitle}>{preset.config.formTitle}</Text>
                        <Text style={styles.sheetItemSub}>
                          {preset.config.fields.length} fields
                        </Text>
                      </View>
                      {isActive && <MaterialIcons name="check-circle" size={22} color="#2589C8" />}
                    </TouchableOpacity>
                  </Swipeable>
                );
              })
            ) : (
              <View style={styles.emptyForms}>
                <MaterialIcons name="delete-forever" size={34} color="#8EA8B8" />
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
        bottom={BOTTOM_BAR_HEIGHT + insets.bottom}
        icon={snackbar?.startsWith('No forms') ? 'info-outline' : 'check-circle'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7FBFE',
  },

  // Scroll
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 0,
    gap: 14,
  },

  // Active form button
  formBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F1F8FD',
    borderWidth: 1,
    borderColor: '#D2E4EF',
    borderRadius: 14,
    padding: 11,
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
    borderColor: '#B8C9D4',
    backgroundColor: '#F3F8FC',
  },
  formTitleEmpty: {
    fontSize: 15,
    fontWeight: '400',
    color: '#8EA8B8',
    fontStyle: 'italic',
  },
  activeFormAction: {
    width: ACTIVE_FORM_SWIPE_ACTION_WIDTH,
    alignItems: 'stretch',
    marginVertical: 2,
  },
  activeFormActionLeft: {
    marginRight: 8,
  },
  activeFormActionRight: {
    marginLeft: 8,
  },
  activeFormActionBtn: {
    flex: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  activeFormExportBtn: {
    backgroundColor: '#2589C8',
  },
  activeFormDeleteBtn: {
    backgroundColor: '#a1161f',
  },

  // Hero
  hero: {
    marginHorizontal: -16,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    paddingHorizontal: 18,
    paddingBottom: 24,
    minHeight: 172,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBubble1: {
    position: 'absolute',
    right: -28,
    top: -38,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  heroBubble2: {
    position: 'absolute',
    right: 34,
    bottom: -46,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroSettingsBtn: {
    position: 'absolute',
    right: 18,
    top: 18,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroBrand: {
    alignItems: 'center',
    gap: 8,
  },
  heroLogoMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    color: '#fff',
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
    color: '#2589C8',
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
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 26,
    paddingVertical: 18,
    backgroundColor: '#2589C8',
    borderRadius: 20,
    shadowColor: '#17689B',
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
    backgroundColor: '#8EA8B8',
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
    backgroundColor: '#F7FBFE',
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
    backgroundColor: '#B8C9D4',
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
    backgroundColor: '#F7FBFE',
  },
  sheetItemActive: {
    backgroundColor: '#EAF6FD',
  },
  sheetDivider: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#E1EEF7',
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
    backgroundColor: '#2589C8',
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
