import React, { useState, useRef, useEffect } from 'react';
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
import { colors } from '../theme/colors';
import {
  buildAndExport,
  buildCsvExport,
  csvExportFilename,
  exportFilename,
} from '../utils/exporter';

type Phase = 'summary' | 'building' | 'done';
type ExportKind = 'zip' | 'csv';

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const entries = useEntriesStore((s) => s.entries);
  const schema = useFormStore((s) => s.schema);

  const [phase, setPhase] = useState<Phase>('summary');
  const [exportKind, setExportKind] = useState<ExportKind>('zip');
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const photoTotal = entries.reduce((sum, e) => {
    // Entries with their own `fields` snapshot use it directly; legacy entries
    // (no snapshot) fall back to the hardcoded 'photo' key, matching
    // EntryCard.tsx's legacy fallback, rather than guessing using the
    // *current* active schema's image field id (which may not match the
    // schema the entry was actually collected under).
    const fieldId = e.fields ? e.fields.find((f) => f.type === 'image')?.id : 'photo';
    if (!fieldId) return sum;
    return sum + ((e.data[fieldId] ?? []) as any[]).length;
  }, 0);
  const zipFilename = schema ? exportFilename(schema.formId) : 'export.zip';
  const csvFilename = schema ? csvExportFilename(schema.formId) : 'export.csv';
  const activeFilename = exportKind === 'csv' ? csvFilename : zipFilename;

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
                <MaterialIcons name="error-outline" size={18} color="#ba1a1a" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="folder-zip" size={26} color={colors.brand.primary} />
                <View>
                  <Text style={styles.cardHeaderTitle}>Ready to export</Text>
                  <Text style={styles.cardHeaderSub}>Choose ZIP with photos or CSV for Excel</Text>
                </View>
              </View>

              {[
                { label: 'Form', value: schema?.formTitle ?? '-' },
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
                  onPress={() => setFormatMenuOpen((open) => !open)}
                  activeOpacity={0.78}
                >
                  <MaterialIcons
                    name={exportKind === 'csv' ? 'table-chart' : 'folder-zip'}
                    size={18}
                    color={colors.brand.primary}
                  />
                  <Text style={styles.formatSelectText}>
                    {exportKind === 'csv' ? 'CSV for Excel' : 'JSON + images'}
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
                    { kind: 'zip' as const, icon: 'folder-zip' as const, label: 'ZIP + images' },
                    { kind: 'csv' as const, icon: 'table-chart' as const, label: 'CSV for Excel' },
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
                      <Text style={styles.formatOptionText}>{option.label}</Text>
                      {exportKind === option.kind && (
                        <MaterialIcons name="check" size={18} color={colors.brand.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.formatHint}>
                CSV opens in Excel but does not include photo files. Use ZIP if you need images.
              </Text>
            </View>

            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={20} color={colors.text.secondary} />
              <Text style={styles.infoText}>
                ZIP file:{' '}
                <Text style={styles.infoMono}>{zipFilename}</Text>
                {'\n'}CSV file:{' '}
                <Text style={styles.infoMono}>{csvFilename}</Text>
                {'\n'}The Android share sheet opens when the file is built.
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
                name={exportKind === 'csv' ? 'table-chart' : 'folder-zip'}
                size={34}
                color={colors.brand.primary}
                style={styles.spinnerIcon}
              />
            </View>
            <Text style={styles.buildingTitle}>{exportKind === 'csv' ? 'Building CSV...' : 'Building ZIP...'}</Text>
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
              name={exportKind === 'csv' ? 'table-chart' : 'folder-zip'}
              size={22}
              color={colors.text.inverse}
            />
            <Text style={styles.buildBtnText}>
              {entries.length === 0
                ? 'No entries to export'
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

const styles = StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: colors.brand.primary,
  },
  formatSelectText: {
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
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
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
