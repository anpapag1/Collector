import React from 'react';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Platform,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { showDialog } from '../store/dialogStore';
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
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import EntryCard from '../components/EntryCard';
import Toast from '../components/Toast';
import { FormConfig } from '../types';
import { loadFromPath } from '../utils/schemaLoader';
import { getEntryDisplayNumbers } from '../utils/entryNumbering';
import { requestSync } from '../services/syncEngine';
import { AppColors, darkColors } from '../theme/colors';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';
import { useThemeStore } from '../store/themeStore';

type FormPreset = {
  id: string;
  config: FormConfig;
};

const GLOBAL_SYNC_META: Record<
  'synced' | 'syncing' | 'pending' | 'error',
  { icon: keyof typeof MaterialIcons.glyphMap; color: string }
> = {
  synced: { icon: 'cloud-done', color: 'rgba(255,255,255,0.55)' },
  syncing: { icon: 'cloud-upload', color: '#fff' },
  pending: { icon: 'cloud-queue', color: 'rgba(255,255,255,0.75)' },
  error: { icon: 'cloud-off', color: '#ffb4ab' },
};

const SNACKBAR_TIMEOUT_MS = 2600;
const BOTTOM_BAR_HEIGHT = 84;
const ENTRY_SWIPE_ACTION_WIDTH = 80;
const FORM_SWIPE_ACTION_WIDTH = 168;
const ACTIVE_FORM_SWIPE_ACTION_WIDTH = 104;

export default function HomeScreen() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const isDark = useThemeStore((state) => state.mode === 'dark');
  const insets = useSafeAreaInsets();
  const schema = useFormStore((s) => s.schema);
  const loadSchema = useFormStore((s) => s.loadSchema);
  const entries = useEntriesStore((s) => s.entries);
  const clearEntries = useEntriesStore((s) => s.clearEntries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);
  const customForms = usePickerStore((s) => s.customForms);
  const addCustomForm = usePickerStore((s) => s.addCustomForm);
  const removeCustomForm = usePickerStore((s) => s.removeCustomForm);
  const activePresetId = usePickerStore((s) => s.activePresetId);
  const setActivePresetId = usePickerStore((s) => s.setActivePresetId);
  const session = useAuthStore((s) => s.session);
  const isOnline = useSyncStore((s) => s.isOnline);

  const [sheet, setSheet] = useState<'config' | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFormSwipeRef = useRef<Swipeable>(null);
  const swipeFormRefs = useRef<Map<string, Swipeable>>(new Map());
  const entrySwipeRefs = useRef<Map<string, Swipeable>>(new Map());
  // Guards against a rapid double-tap on "New entry" firing router.push
  // twice (stacking a duplicate /collect screen) before the first
  // navigation has had a chance to actually move us off this screen.
  const navigatingRef = useRef(false);

  const currentUserId = session?.user?.id ?? null;

  // Same claim-flow semantics as entries: a form claimed by a different
  // account must not appear in this account's (or a signed-out user's) list.
  const ownedCustomForms = useMemo(
    () =>
      customForms.filter((f) =>
        currentUserId ? f.userId === currentUserId || f.userId == null : f.userId == null,
      ),
    [customForms, currentUserId],
  );
  const customPresets: FormPreset[] = useMemo(
    () =>
      ownedCustomForms
        .filter(({ config }) => config?.formTitle && config?.fields)
        .map(({ importId, config }) => ({
          id: importId,
          config,
        })),
    [ownedCustomForms],
  );
  const malformedCustomFormCount = ownedCustomForms.length - customPresets.length;
  const presets = customPresets;
  const formTitle = useMemo(() => schema?.formTitle ?? '—', [schema]);
  // Entries belong to whichever account claimed them (or to nobody yet, if
  // collected before signing in). Showing another already-claimed account's
  // entries on this device would leak its data to whoever's currently signed
  // in, so unclaimed (userId == null) entries stay visible to "whoever is
  // using the device right now", but entries claimed by a different account
  // never show up here.
  const ownedEntries = useMemo(
    () =>
      entries.filter((e) =>
        currentUserId ? e.userId === currentUserId || e.userId == null : e.userId == null,
      ),
    [entries, currentUserId],
  );
  // Only entries collected under the currently active form — entries from
  // other (or deleted) forms must never show up on the home screen.
  const activeFormEntries = useMemo(
    () => (schema ? ownedEntries.filter((e) => e.formTitle === schema.formTitle) : []),
    [ownedEntries, schema],
  );
  const sorted = useMemo(
    () => [...activeFormEntries].sort((a, b) => b.createdAt - a.createdAt),
    [activeFormEntries],
  );
  const recent = useMemo(() => sorted.slice(0, 3), [sorted]);
  const total = useMemo(() => activeFormEntries.length, [activeFormEntries]);
  const displayNumbers = useMemo(() => getEntryDisplayNumbers(activeFormEntries), [activeFormEntries]);

  const globalSyncStatus = useMemo<'synced' | 'syncing' | 'pending' | 'error' | null>(() => {
    if (!session) return null;
    if (activeFormEntries.some((e) => e.syncStatus === 'error')) return 'error';
    if (activeFormEntries.some((e) => e.syncStatus === 'syncing')) return 'syncing';
    if (activeFormEntries.some((e) => e.syncStatus === 'pending')) return 'pending';
    return 'synced';
  }, [session, activeFormEntries]);

  const syncPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (sheet === null) {
      const isActiveValid = activePresetId && presets.some((p) => p.id === activePresetId);
      if (!isActiveValid) {
        if (presets.length > 0) {
          loadSchema(presets[0].config);
          setActivePresetId(presets[0].id);
        } else {
          useFormStore.getState().clearSchema();
          setActivePresetId(null);
        }
      }
    }
  }, [sheet, activePresetId, presets, loadSchema, setActivePresetId]);

  useEffect(() => {
    if (globalSyncStatus !== 'syncing') {
      syncPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(syncPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(syncPulse, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [globalSyncStatus, syncPulse]);

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
      const num = displayNumbers.get(id) ?? 0;
      showDialog({
        title: 'Delete entry?',
        message: `Entry #${String(num).padStart(2, '0')} will be permanently removed.`,
        actions: [
          { label: 'Cancel', style: 'cancel', onPress: () => entrySwipeRefs.current.get(id)?.close() },
          {
            label: 'Delete',
            style: 'destructive',
            onPress: () => {
              entrySwipeRefs.current.get(id)?.close();
              deleteEntry(id);
              showSnack('Entry deleted');
            },
          },
        ],
      });
    },
    [deleteEntry, showSnack, displayNumbers],
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
          <MaterialIcons name="delete" size={24} color={colors.text.inverse} />
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

    showDialog({
      title: 'Delete form?',
      message: `${preset.config.formTitle} will be removed from this list.`,
      actions: [
        { label: 'Cancel', style: 'cancel', onPress: () => closeSwipe(presetId) },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeCustomForm(presetId);
            // Deleting a form also deletes everything collected under it —
            // otherwise its entries would be orphaned, with no form left to
            // view or export them from.
            clearEntries({ formTitle: preset.config.formTitle });

            // Read live store state instead of the closed-over `presets`/`activePresetId`
            // variables, which may be stale by the time this async alert callback fires.
            const pickerState = usePickerStore.getState();
            const liveRemaining = pickerState.customForms
              .filter(({ config }) => config?.formTitle && config?.fields)
              .filter((item) => item.importId !== presetId);

            if (liveRemaining.length === 0) {
              useFormStore.getState().clearSchema();
              usePickerStore.getState().setActivePresetId(null);
              showSnack('No forms left — import a form to continue');
            }
          },
        },
      ],
    });
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
          <MaterialIcons name="download" size={20} color={colors.text.inverse} />
          <Text style={styles.actionLabel}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteFormBtn}
          onPress={() => deletePreset(preset.id)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="delete" size={20} color={colors.text.inverse} />
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

    showDialog({
      title: 'Delete all entries?',
      message: `This will permanently remove all ${total} ${total === 1 ? 'entry' : 'entries'}.`,
      actions: [
        { label: 'Cancel', style: 'cancel', onPress: () => activeFormSwipeRef.current?.close() },
        {
          label: 'Delete all',
          style: 'destructive',
          onPress: () => {
            clearEntries({ formTitle: schema?.formTitle });
            showSnack('All entries deleted');
          },
        },
      ],
    });
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
          <MaterialIcons name="ios-share" size={21} color={colors.text.inverse} />
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
          <MaterialIcons name="delete-sweep" size={21} color={colors.text.inverse} />
          <Text style={styles.actionLabel}>Delete All</Text>
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
      addCustomForm(config, importId, session?.user.id ?? null);
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
          colors={
            isDark
              ? [darkColors.brand.primaryDark, darkColors.brand.primary, darkColors.brand.primaryLight]
              : [colors.brand.primaryDark, colors.brand.primary, colors.brand.primaryLight]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 18 }]}
        >
          <View style={styles.heroBubble1} />
          <View style={styles.heroBubble2} />
          {globalSyncStatus && (
            <TouchableOpacity
              style={[styles.heroSyncBtn, { top: insets.top + 18 }]}
              onPress={() => {
                requestSync();
                showSnack('Syncing…');
              }}
              activeOpacity={0.78}
            >
              <Animated.View
                style={
                  globalSyncStatus === 'syncing'
                    ? {
                        opacity: syncPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                      }
                    : undefined
                }
              >
                <MaterialIcons
                  name={GLOBAL_SYNC_META[globalSyncStatus].icon}
                  size={16}
                  color={GLOBAL_SYNC_META[globalSyncStatus].color}
                />
              </Animated.View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.heroSettingsBtn, { top: insets.top + 18 }]}
            onPress={() => router.push('/settings')}
            activeOpacity={0.78}
          >
            <MaterialIcons name="settings" size={18} color={colors.text.inverse} />
          </TouchableOpacity>
          <View style={styles.heroBrand}>
            {/* <View style={styles.heroLogoMark}> */}
              <CollectorLogo width={100} height={100} />
            {/* </View> */}
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
              color={schema ? colors.brand.primary : colors.text.muted}
            />
            <View style={styles.formBtnBody}>
              <Text style={styles.formLabel}>Active form</Text>
              {schema ? (
                <Text style={styles.formTitle} numberOfLines={1}>{formTitle}</Text>
              ) : (
                <Text style={styles.formTitleEmpty}>No form loaded</Text>
              )}
            </View>
          </TouchableOpacity>
        </Swipeable>

        {/* Latest entries header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Latest entries</Text>
          <View style={styles.sectionHeaderActions}>
            <TouchableOpacity onPress={() => router.push('/map/all')}>
              <Text style={styles.viewAll}>Open map</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/entries')}>
              <Text style={styles.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Empty state */}
        {total === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="inventory" size={46} color={colors.text.muted} />
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
                  displayNumber={displayNumbers.get(entry.id) ?? 0}
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
          // Ignore a second tap that lands before this one's navigation has
          // taken effect — otherwise a fast double-tap can stack two
          // /collect screens on top of each other.
          if (navigatingRef.current) return;
          navigatingRef.current = true;
          router.push('/collect');
          setTimeout(() => {
            navigatingRef.current = false;
          }, 500);
        }}
        activeOpacity={schema ? 0.85 : 1}
      >
        <MaterialIcons name="add" size={24} color={colors.text.inverse} />
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
                      <MaterialIcons name="description" size={22} color={colors.brand.primary} />
                      <View style={styles.sheetItemBody}>
                        <Text style={styles.sheetItemTitle}>{preset.config.formTitle}</Text>
                        <Text style={styles.sheetItemSub}>
                          {preset.config.fields.length} fields
                        </Text>
                      </View>
                      {isActive && <MaterialIcons name="check-circle" size={22} color={colors.brand.primary} />}
                    </TouchableOpacity>
                  </Swipeable>
                );
              })
            ) : (
              <View style={styles.emptyForms}>
                <MaterialIcons name="post-add" size={34} color={colors.text.muted} />
                <Text style={styles.emptyFormsTitle}>No forms yet</Text>
                <Text style={styles.emptyFormsHint}>
                  {session
                    ? 'Create a form on the web app and it\'ll sync here, or import a JSON file from device.'
                    : 'Sign in to sync forms created on the web app, or import a JSON file from device.'}
                </Text>
              </View>
            )}
            <TouchableOpacity style={[styles.sheetItem, styles.sheetDivider]} onPress={browseFiles}>
              <MaterialIcons name="folder-open" size={22} color={colors.text.secondary} />
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

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.app,
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
    backgroundColor: colors.background.soft,
    borderWidth: 1,
    borderColor: colors.border.default,
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
    color: colors.text.secondary,
    fontWeight: '600',
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.primary,
  },
  formBtnEmpty: {
    borderColor: colors.border.input,
    backgroundColor: colors.background.fieldSoft,
  },
  formTitleEmpty: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.text.muted,
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
    backgroundColor: colors.action.primary,
  },
  activeFormDeleteBtn: {
    backgroundColor: colors.action.delete,
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
    backgroundColor: colors.overlay.heroBubbleStrong,
  },
  heroBubble2: {
    position: 'absolute',
    right: 34,
    bottom: -46,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.overlay.heroBubbleSoft,
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
    backgroundColor: colors.overlay.heroButton,
    borderWidth: 1,
    borderColor: colors.overlay.heroButtonBorder,
  },
  heroSyncBtn: {
    position: 'absolute',
    right: 60,
    top: 18,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay.heroButton,
    borderWidth: 1,
    borderColor: colors.overlay.heroButtonBorder,
  },
  heroBrand: {
    alignItems: 'center',
  },
  heroLogoMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay.heroLogo,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    color: colors.text.inverse,
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
    color: colors.text.primary,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand.primary,
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
    color: colors.text.primary,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.text.secondary,
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
    backgroundColor: colors.action.delete,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.inverse,
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
    backgroundColor: colors.action.primary,
    borderRadius: 20,
    shadowColor: colors.shadow.brand,
    shadowOpacity: 0.42,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  fabText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.inverse,
  },
  fabDisabled: {
    backgroundColor: colors.action.disabled,
    shadowOpacity: 0.12,
    elevation: 3,
  },

  // Scrim
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay.scrim,
    zIndex: 30,
  },

  // Sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 31,
    backgroundColor: colors.background.app,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    maxHeight: '82%',
    shadowColor: colors.shadow.black,
    shadowOpacity: 0.18,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  sheetHandle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.muted,
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
    color: colors.text.primary,
  },
  sheetSub: {
    fontSize: 13,
    color: colors.text.secondary,
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
    backgroundColor: colors.background.app,
  },
  sheetItemActive: {
    backgroundColor: colors.background.elevatedGreen,
  },
  sheetDivider: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: colors.border.section,
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
    color: colors.text.primary,
  },
  sheetItemSub: {
    fontSize: 12,
    color: colors.text.secondary,
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
    backgroundColor: colors.action.primary,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteFormBtn: {
    flex: 1,
    backgroundColor: colors.action.delete,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.inverse,
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
    color: colors.text.primary,
  },
  emptyFormsHint: {
    fontSize: 12.5,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

});
