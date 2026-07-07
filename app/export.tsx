import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../store/entriesStore';
import { useFormStore } from '../store/formStore';
import { usePickerStore } from '../store/pickerStore';
import { useAuthStore } from '../store/authStore';
import { AppColors } from '../theme/colors';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';
import {
  buildAndExport,
  buildCsvExport,
  buildXlsxExport,
  csvExportFilename,
  exportFilename,
  xlsxExportFilename,
} from '../utils/exporter';

type Phase = 'summary' | 'building' | 'done';
type ExportKind = 'zip' | 'csv' | 'xlsx';

export default function ExportScreen() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const allEntries = useEntriesStore((s) => s.entries);
  const initialSchema = useFormStore((s) => s.schema);
  const customForms = usePickerStore((s) => s.customForms);
  const session = useAuthStore((s) => s.session);
  const currentUserId = session?.user?.id ?? null;

  const availableForms = useMemo(() => {
    return customForms
      .filter((f) => (currentUserId ? f.userId === currentUserId || f.userId == null : f.userId == null))
      .map(f => ({
        id: f.importId,
        title: f.config.formTitle,
        config: f.config,
        ownerId: f.userId ?? currentUserId ?? ''
      }));
  }, [customForms, currentUserId]);

  const [selectedFormId, setSelectedFormId] = useState<string | null>(initialSchema?.formId ?? null);

  useEffect(() => {
    if (!selectedFormId && availableForms.length > 0) {
      setSelectedFormId(availableForms[0].id);
    }
  }, [selectedFormId, availableForms]);

  const activeForm = useMemo(() => availableForms.find(f => f.id === selectedFormId), [availableForms, selectedFormId]);
  const schema = activeForm?.config ?? null;

  // Never export another already-claimed account's entries that happen to
  // still be cached on this device — only the signed-in account's own
  // entries plus any not-yet-claimed (userId == null) local entries.
  const ownedEntries = useMemo(
    () =>
      allEntries.filter((e) =>
        currentUserId ? e.userId === currentUserId || e.userId == null : e.userId == null,
      ),
    [allEntries, currentUserId],
  );
  // Export only the active form's entries — other forms' data shouldn't
  // leak into this form's export file.
  const entries = useMemo(
    () => (schema ? ownedEntries.filter((e) => e.formTitle === schema.formTitle) : []),
    [ownedEntries, schema],
  );

  const [phase, setPhase] = useState<Phase>('summary');
  const [exportKind, setExportKind] = useState<ExportKind>('xlsx');
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [formMenuOpen, setFormMenuOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Reset export status when the selected form changes
  useEffect(() => {
    setPhase('summary');
    setProgress(0);
    setError(null);
  }, [selectedFormId]);

  const photoTotal = useMemo(
    () =>
      entries.reduce((sum, e) => {
        // Entries with their own `fields` snapshot use it directly (a form can
        // have more than one image-type field); legacy entries (no snapshot)
        // fall back to the hardcoded 'photo' key, matching EntryCard.tsx's
        // legacy fallback, rather than guessing using the *current* active
        // schema's image field id (which may not match the schema the entry was
        // actually collected under).
        const fieldIds = e.fields ? e.fields.filter((f) => f.type === 'image').map((f) => f.id) : ['photo'];
        return sum + fieldIds.reduce((s, fieldId) => s + ((e.data[fieldId] ?? []) as any[]).length, 0);
      }, 0),
    [entries],
  );
  const zipFilename  = schema ? exportFilename(schema.formId)     : 'export.zip';
  const csvFilename  = schema ? csvExportFilename(schema.formId)  : 'export.csv';
  const xlsxFilename = schema ? xlsxExportFilename(schema.formId) : 'export.xlsx';
  const activeFilename = exportKind === 'csv' ? csvFilename : exportKind === 'xlsx' ? xlsxFilename : zipFilename;

  useEffect(() => {
    if (phase === 'building') {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
    return () => {
      spinAnim.stopAnimation();
    };
  }, [phase]);

  const animateTo = (pct: number) => {
    setProgress(pct);
    Animated.timing(progressAnim, {
      toValue: pct / 100,
      duration: 120,
      useNativeDriver: false,
    }).start();
  };

  const handleBuild = async () => {
    if (!schema) return;
    setPhase('building');
    setError(null);
    animateTo(0);

    try {
      if (exportKind === 'csv') {
        const { path: csvPath } = await buildCsvExport(entries, schema, (pct) => animateTo(pct));
        setPhase('done');
        await Sharing.shareAsync(csvPath, {
          mimeType: 'text/csv',
          dialogTitle: 'Share CSV export',
        });
      } else if (exportKind === 'xlsx') {
        const { path: xlsxPath, skippedPhotos } = await buildXlsxExport(entries, schema, (pct) => animateTo(pct));
        setPhase('done');
        if (skippedPhotos > 0) {
          setError(`${skippedPhotos} photo${skippedPhotos === 1 ? '' : 's'} could not be embedded and were skipped.`);
        }
        await Sharing.shareAsync(xlsxPath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Share Excel export',
        });
      } else {
        const { path: zipPath, skippedPhotos } = await buildAndExport(entries, schema, (pct) =>
          animateTo(pct)
        );
        setPhase('done');
        if (skippedPhotos > 0) {
          setError(
            `${skippedPhotos} photo${skippedPhotos === 1 ? '' : 's'} could not be read and were skipped from the export.`
          );
        }
        await Sharing.shareAsync(zipPath, {
          mimeType: 'application/zip',
          dialogTitle: 'Share export',
        });
      }

      // Sharing.shareAsync resolves even if the user cancels the share sheet,
      // so we can't reliably tell success from cancellation here. Stay on
      // this screen and let the user navigate back themselves rather than
      // risk redirecting home when nothing was actually shared.
      setPhase('summary');
    } catch (e: any) {
      setError(e?.message ?? `${exportKind.toUpperCase()} export failed`);
      setPhase('summary');
    }
  };

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Export data</Text>
      </View>

      <View style={styles.body}>
        {/* Summary phase */}
        {(phase === 'summary') && (
          <>
            {error && (
              <View style={styles.errorBox}>
                <MaterialIcons name="error-outline" size={18} color={colors.text.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name={exportKind === 'xlsx' ? 'table-chart' : exportKind === 'csv' ? 'table-chart' : 'folder-zip'} size={26} color={colors.brand.primary} />
                <View>
                  <Text style={styles.cardHeaderTitle}>Ready to export</Text>
                  <Text style={styles.cardHeaderSub}>Choose a format to download</Text>
                </View>
              </View>

              <View style={styles.formatRow}>
                <Text style={styles.cardRowLabel}>Form</Text>
                <TouchableOpacity
                  style={styles.formatSelect}
                  onPress={() => {
                    setFormMenuOpen((open) => !open);
                    setFormatMenuOpen(false);
                  }}
                  activeOpacity={0.78}
                >
                  <Text style={styles.formatSelectText} numberOfLines={1} ellipsizeMode="middle">
                    {schema?.formTitle ?? 'Select a form'}
                  </Text>
                  <MaterialIcons
                    name={formMenuOpen ? 'expand-less' : 'expand-more'}
                    size={20}
                    color={colors.text.secondary}
                  />
                </TouchableOpacity>
              </View>

              {formMenuOpen && (
                <View style={styles.formatMenu}>
                  {availableForms.map((f) => {
                    const isSelected = f.id === selectedFormId;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[
                          styles.formatOption,
                          isSelected && styles.formatOptionActive,
                        ]}
                        onPress={() => {
                          setSelectedFormId(f.id);
                          setFormMenuOpen(false);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.formatOptionText} numberOfLines={1}>{f.title}</Text>
                        </View>
                        {isSelected && (
                          <MaterialIcons name="check" size={18} color={colors.brand.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {[
                { label: 'Entries', value: String(entries.length) },
                { label: 'Photos', value: String(photoTotal) },
              ].map((row) => (
                <View key={row.label} style={[styles.cardRow, styles.cardRowBorder]}>
                  <Text style={styles.cardRowLabel}>{row.label}</Text>
                  <Text style={styles.cardRowValue} numberOfLines={2}>{row.value}</Text>
                </View>
              ))}

              <View style={styles.formatRow}>
                <Text style={styles.cardRowLabel}>Export format</Text>
                <TouchableOpacity
                  style={styles.formatSelect}
                  onPress={() => {
                    setFormatMenuOpen((open) => !open);
                    setFormMenuOpen(false);
                  }}
                  activeOpacity={0.78}
                >
                  <MaterialIcons
                    name={exportKind === 'xlsx' ? 'grid-on' : exportKind === 'csv' ? 'table-chart' : 'folder-zip'}
                    size={18}
                    color={colors.brand.primary}
                  />
                  <Text style={styles.formatSelectText}>
                    {exportKind === 'xlsx' ? 'Excel with photos' : exportKind === 'csv' ? 'CSV for Excel' : 'ZIP + images'}
                  </Text>
                  <MaterialIcons
                    name={formatMenuOpen ? 'expand-less' : 'expand-more'}
                    size={20}
                    color={colors.text.secondary}
                  />
                </TouchableOpacity>
              </View>

              {formatMenuOpen && (
                <View style={styles.formatMenu}>
                  {[
                    { kind: 'xlsx' as const, icon: 'grid-on' as const,      label: 'Excel with photos (.xlsx)', sub: 'Spreadsheet with embedded images' },
                    { kind: 'csv'  as const, icon: 'table-chart' as const,   label: 'CSV for Excel (.csv)',      sub: 'Spreadsheet, no photos' },
                    { kind: 'zip'  as const, icon: 'folder-zip' as const,    label: 'ZIP + images (.zip)',        sub: 'JSON data and original photos' },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.kind}
                      style={[
                        styles.formatOption,
                        exportKind === option.kind && styles.formatOptionActive,
                      ]}
                      onPress={() => {
                        setExportKind(option.kind);
                        setFormatMenuOpen(false);
                      }}
                    >
                      <MaterialIcons name={option.icon} size={18} color={colors.brand.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.formatOptionText}>{option.label}</Text>
                        <Text style={styles.formatOptionSub}>{option.sub}</Text>
                      </View>
                      {exportKind === option.kind && (
                        <MaterialIcons name="check" size={18} color={colors.brand.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.formatHint}>
                {exportKind === 'xlsx'
                  ? 'Excel file with photos embedded directly in the spreadsheet cells.'
                  : exportKind === 'csv'
                  ? 'CSV opens in Excel but does not include photo files.'
                  : 'ZIP contains the full JSON data plus all original photo files.'}
              </Text>
            </View>

            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={20} color={colors.text.secondary} />
              <Text style={styles.infoText}>
                {exportKind === 'xlsx' ? 'Excel file: ' : exportKind === 'csv' ? 'CSV file: ' : 'ZIP file: '}
                <Text style={styles.infoMono}>{activeFilename}</Text>
                {'\n'}The share sheet opens when the file is ready.
              </Text>
            </View>
          </>
        )}

        {/* Building phase */}
        {phase === 'building' && (
          <View style={styles.buildingCenter}>
            <View style={styles.spinnerWrap}>
              <Animated.View
                style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}
              />
              <MaterialIcons
                name={exportKind === 'xlsx' ? 'grid-on' : exportKind === 'csv' ? 'table-chart' : 'folder-zip'}
                size={34}
                color={colors.brand.primary}
                style={styles.spinnerIcon}
              />
            </View>
            <Text style={styles.buildingTitle}>{exportKind === 'xlsx' ? 'Building Excel...' : exportKind === 'csv' ? 'Building CSV...' : 'Building ZIP...'}</Text>
            <Text style={styles.buildingFilename}>{activeFilename}</Text>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressLabel}>{progress}%</Text>
          </View>
        )}
      </View>

      {/* Build & export button */}
      {phase === 'summary' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.buildBtn, entries.length === 0 && styles.buildBtnDisabled]}
            onPress={handleBuild}
            activeOpacity={0.85}
            disabled={entries.length === 0}
          >
            <MaterialIcons
              name={exportKind === 'xlsx' ? 'grid-on' : exportKind === 'csv' ? 'table-chart' : 'folder-zip'}
              size={22}
              color={colors.text.inverse}
            />
            <Text style={styles.buildBtnText}>
              {entries.length === 0
                ? 'No entries to export'
                : exportKind === 'xlsx'
                  ? 'Export Excel (.xlsx)'
                  : exportKind === 'csv'
                    ? 'Export CSV'
                    : 'Export ZIP'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.app },

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
    color: colors.text.primary,
    paddingLeft: 4,
  },

  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background.warningSoft,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { fontSize: 13, color: colors.text.danger, flex: 1 },

  // Stats card
  card: {
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: colors.border.section,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    backgroundColor: colors.background.soft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.section,
  },
  cardHeaderTitle: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  cardHeaderSub: { fontSize: 12, color: colors.text.secondary, marginTop: 1 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  cardRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.divider,
  },
  cardRowLabel: { fontSize: 13, color: colors.text.secondary },
  cardRowValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    textAlign: 'right',
    maxWidth: '62%',
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  formatSelect: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 12,
    marginLeft: 16,
    borderRadius: 12,
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: colors.brand.primary,
  },
  formatSelectText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  formatMenu: {
    borderTopWidth: 1,
    borderTopColor: colors.border.section,
    padding: 8,
    gap: 6,
  },
  formatOption: {
    minHeight: 42,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
  },
  formatOptionActive: {
    backgroundColor: colors.background.soft,
  },
  formatOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  formatOptionSub: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 1,
  },
  formatHint: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    marginTop: -2,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
  },

  // Info box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.background.soft,
    borderRadius: 14,
    padding: 14,
  },
  infoText: { fontSize: 12.5, lineHeight: 19, color: colors.text.secondary, flex: 1 },
  infoMono: { fontFamily: 'monospace', color: colors.text.primary },

  // Building
  buildingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    paddingBottom: 30,
  },
  spinnerWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 6,
    borderColor: colors.border.formSection,
    borderTopColor: colors.brand.primary,
  },
  spinnerIcon: {
    position: 'absolute',
  },
  buildingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 22,
  },
  buildingFilename: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
  },
  progressTrack: {
    width: 300,
    height: 8,
    backgroundColor: colors.border.formSection,
    borderRadius: 100,
    marginTop: 22,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
    borderRadius: 100,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand.primary,
    marginTop: 8,
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  buildBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.brand.primary,
    shadowColor: colors.brand.primary,
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  buildBtnDisabled: {
    backgroundColor: colors.action.disabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  buildBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.inverse,
  },
});
