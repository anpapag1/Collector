import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Animated } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useEntriesStore } from '../store/entriesStore';
import { usePickerStore } from '../store/pickerStore';
import { buildCsvString, buildXlsxWorkbookBase64, xlsxExportFilename, buildZipBase64, exportFilename } from '../utils/exporter';
import { resolveEntryPhotoUrl } from '../utils/photoUrls';
import { AdminForm } from '../services/adminService';
import { useAdminStore } from '../store/adminStore';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';
import { AppColors } from '../theme/colors';
import DashboardNav from '../components/dashboard/DashboardNav';
import PageHeader from '../components/dashboard/PageHeader';
import { useRequireWebSession } from '../components/dashboard/useRequireWebSession';
import type { Entry, FormConfig, PhotoItem } from '../types';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

type Phase = 'summary' | 'building' | 'done';
type ExportKind = 'csv' | 'xlsx' | 'zip';

export default function DashboardExport() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const { ready, userId, isAdmin, profiles, ownerFilter, setOwnerFilter, dataMode, ownerIdParam } = useRequireWebSession();
  
  const { formId } = useLocalSearchParams<{ formId?: string }>();

  const localAllEntries = useEntriesStore((s) => s.entries);
  const customForms = usePickerStore((s) => s.customForms);

  const [adminForms, setAdminForms] = useState<AdminForm[]>([]);
  const [adminEntries, setAdminEntries] = useState<Entry[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(dataMode === 'admin');

  const loadForms = useAdminStore((s) => s.loadForms);
  const loadEntries = useAdminStore((s) => s.loadEntries);

  useEffect(() => {
    if (dataMode !== 'admin') return;
    setLoadingAdmin(true);
    Promise.all([loadForms(ownerIdParam), loadEntries(ownerIdParam)])
      .then(([forms, entries]) => {
        setAdminForms(forms);
        setAdminEntries(
          entries
            .map((e) => ({
              id: e.localId,
              remoteId: e.remoteId,
              createdAt: e.createdAt,
              updatedAt: e.updatedAt,
              formTitle: e.formTitle ?? undefined,
              formRemoteId: e.formRemoteId,
              fields: e.fields,
              data: e.data,
              userId: e.userId,
              syncStatus: 'synced' as const,
            })),
        );
      })
      .catch((e) => console.warn('[export] failed to load admin data', e))
      .finally(() => setLoadingAdmin(false));
  }, [dataMode, ownerIdParam, loadForms, loadEntries]);

  const availableForms = useMemo(() => {
    if (dataMode === 'admin') {
      return adminForms.map(f => ({
        id: f.dbId,
        title: f.schema.formTitle,
        config: f.schema,
        ownerId: f.userId
      }));
    }
    return customForms
      .filter((f) => (userId ? f.userId === userId || f.userId == null : f.userId == null))
      .map(f => ({
        id: f.importId,
        title: f.config.formTitle,
        config: f.config,
        ownerId: f.userId ?? userId ?? ''
      }));
  }, [dataMode, adminForms, customForms, userId]);

  const [selectedFormId, setSelectedFormId] = useState<string | null>(formId ?? null);

  useEffect(() => {
    if (!selectedFormId && availableForms.length > 0 && !loadingAdmin) {
      setSelectedFormId(availableForms[0].id);
    }
  }, [selectedFormId, availableForms, loadingAdmin]);

  const activeForm = useMemo(() => availableForms.find(f => f.id === selectedFormId), [availableForms, selectedFormId]);
  const config = activeForm?.config ?? null;

  const entries = useMemo(() => {
    if (!activeForm) return [];
    if (dataMode === 'admin') {
      return adminEntries.filter((e) => e.formTitle === activeForm.title);
    }
    return localAllEntries.filter(
      (e) =>
        e.formTitle === activeForm.title &&
        (userId ? e.userId === userId || e.userId == null : e.userId == null),
    );
  }, [dataMode, adminEntries, localAllEntries, activeForm, userId]);

  const photoTotal = useMemo(
    () =>
      entries.reduce((sum, entry) => {
        const imageFieldIds = (entry.fields ?? config?.fields ?? [])
          .filter((f) => f.type === 'image')
          .map((f) => f.id);
        return sum + imageFieldIds.reduce((s, id) => s + (entry.data[id]?.length ?? 0), 0);
      }, 0),
    [entries, config],
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

  const resolvePhotoUri = useCallback(
    (photo: PhotoItem, entry: Entry) => {
      if (!entry.formRemoteId) return Promise.resolve(null);
      return resolveEntryPhotoUrl(photo, entry.formRemoteId, entry.id);
    },
    [],
  );

  const runExport = async () => {
    if (!config) return;
    setError(null);
    setPhase('building');
    animateTo(0);
    
    try {
      if (exportKind === 'csv') {
        const { csv, filename } = buildCsvString(entries, config, (pct) => animateTo(pct));
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
      } else if (exportKind === 'xlsx') {
        const { base64, skippedPhotos } = await buildXlsxWorkbookBase64(entries, config, (pct) => animateTo(pct), resolvePhotoUri);
        downloadBlob(
          base64ToBlob(base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
          xlsxExportFilename(config.formId),
        );
        if (skippedPhotos > 0) {
          console.warn(`${skippedPhotos} photos were skipped.`);
        }
      } else {
        const { base64, skippedPhotos } = await buildZipBase64(entries, config, (pct) => animateTo(pct), resolvePhotoUri);
        downloadBlob(
          base64ToBlob(base64, 'application/zip'),
          exportFilename(config.formId),
        );
        if (skippedPhotos > 0) {
          console.warn(`${skippedPhotos} photos were skipped.`);
        }
      }
      setPhase('done');
      // On web we immediately download, so we can transition right back to summary after a short delay
      setTimeout(() => setPhase('summary'), 1500);
    } catch (e: any) {
      setError(e?.message ?? 'Export failed');
      setPhase('summary');
    }
  };

  const ownerLabelFor = (ownerId: string) => {
    if (ownerId === userId) return undefined;
    return profiles.find((p) => p.id === ownerId)?.email ?? ownerId;
  };

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const zipFilename  = config ? exportFilename(config.formId)     : 'export.zip';
  const csvFilename  = config ? xlsxExportFilename(config.formId).replace('.xlsx', '.csv')  : 'export.csv';
  const xlsxFilename = config ? xlsxExportFilename(config.formId) : 'export.xlsx';
  const activeFilename = exportKind === 'csv' ? csvFilename : exportKind === 'xlsx' ? xlsxFilename : zipFilename;

  if (!ready) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <DashboardNav />


      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader 
          kicker="DATA MANAGEMENT" 
          title="Export" 
          subtitle="Download your collected entries as CSV, Excel, or JSON."
        />
        {loadingAdmin ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.brand.primary} />
          </View>
        ) : availableForms.length === 0 ? (
          <View style={styles.card}>
            <View style={styles.empty}>
              <MaterialIcons name="description" size={40} color={colors.text.muted} />
              <Text style={styles.emptyTitle}>No forms available</Text>
            </View>
          </View>
        ) : (
          <>
            {/* Summary Phase */}
            {phase === 'summary' && (
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
                        {config?.formTitle ?? 'Select a form'}
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
                        const ownerLabel = ownerLabelFor(f.ownerId);
                        const displayTitle = ownerLabel ? `${f.title} — ${ownerLabel}` : f.title;
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
                              <Text style={styles.formatOptionText} numberOfLines={1}>{displayTitle}</Text>
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
                    {'\n'}The browser download will start when the file is ready.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.buildBtn, entries.length === 0 && styles.buildBtnDisabled]}
                  onPress={runExport}
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
              </>
            )}

            {/* Building phase */}
            {(phase === 'building' || phase === 'done') && (
              <View style={styles.buildingCenter}>
                <View style={styles.spinnerWrap}>
                  <Animated.View
                    style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}
                  />
                  <MaterialIcons
                    name={phase === 'done' ? 'check' : exportKind === 'xlsx' ? 'grid-on' : exportKind === 'csv' ? 'table-chart' : 'folder-zip'}
                    size={34}
                    color={colors.brand.primary}
                    style={styles.spinnerIcon}
                  />
                </View>
                <Text style={styles.buildingTitle}>
                  {phase === 'done' 
                    ? 'Download Complete' 
                    : exportKind === 'xlsx' ? 'Building Excel...' : exportKind === 'csv' ? 'Building CSV...' : 'Building ZIP...'}
                </Text>
                <Text style={styles.buildingFilename}>{activeFilename}</Text>
                <View style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
                </View>
                <Text style={styles.progressLabel}>{phase === 'done' ? '100%' : `${progress}%`}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.app },
  center: { alignItems: 'center', justifyContent: 'center' },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.soft,
    backgroundColor: colors.background.white,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  filterSpacer: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 40,
    paddingVertical: 40,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    gap: 20,
  },
  
  formSelectorContainer: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 10,
  },
  formSelectorScroll: {
    flexGrow: 0,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.white,
  },
  filterChipActive: {
    backgroundColor: colors.brand.primarySoft,
    borderColor: colors.brand.primary,
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    maxWidth: 250,
  },
  filterChipLabelActive: {
    color: colors.brand.primary,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
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
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  pageKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
  },
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    paddingVertical: 40,
    backgroundColor: colors.background.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.section,
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
    width: '80%',
    maxWidth: 300,
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

  // Button
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
    marginTop: 8,
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
