import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TouchableWithoutFeedback, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { showDialog } from '../store/dialogStore';
import { useEntriesStore } from '../store/entriesStore';
import { usePickerStore, CustomForm } from '../store/pickerStore';
import { useFormDraftStore } from '../store/formDraftStore';
import { fetchEntryFormTitles, deleteFormAdmin, switchFormOwner, AdminForm } from '../services/adminService';
import { useAdminStore } from '../store/adminStore';
import { FormConfig } from '../types';
import { FORM_TEMPLATES } from '../utils/formTemplates';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';
import { AppColors } from '../theme/colors';
import DashboardNav from '../components/dashboard/DashboardNav';
import PageHeader from '../components/dashboard/PageHeader';
import SwitchOwnerModal from '../components/dashboard/SwitchOwnerModal';
import { useRequireWebSession } from '../components/dashboard/useRequireWebSession';

// One shape both the local-store (Phase 1, non-admin) and admin-fetched
// (Phase 2) forms are normalized to, so the grid/actions below don't need to
// branch on data source except when actually calling a mutation.
type DisplayForm = {
  key: string;
  config: FormConfig;
  ownerId: string;
  ownerLabel?: string;
  // Present only for locally-known forms (own device, own account).
  local?: CustomForm;
  // Present only for admin-fetched forms.
  admin?: AdminForm;
};

function downloadJson(config: FormConfig) {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.formTitle.replace(/[\s/\\:*?"<>|]+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Web dashboard home — a grid of forms, each showing its entry count and
// linking into that form's entries. Overrides the native app/index.tsx home
// screen only on web (Metro platform-extension resolution); the native
// screen is untouched. Non-admin users read the same local stores the
// native app already keeps in sync (Phase 1); admins fetch directly via
// adminService, scoped by the "Filter by user" control (Phase 2 §A).
export default function DashboardHome() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const isNarrow = width < 700;
  const { ready, userId, isAdmin, profiles, ownerFilter, setOwnerFilter, dataMode, ownerIdParam } =
    useRequireWebSession();

  const localEntries = useEntriesStore((s) => s.entries);
  const localCustomForms = usePickerStore((s) => s.customForms);
  const addCustomForm = usePickerStore((s) => s.addCustomForm);
  const removeCustomForm = usePickerStore((s) => s.removeCustomForm);
  const clearEntries = useEntriesStore((s) => s.clearEntries);

  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const [adminForms, setAdminForms] = useState<AdminForm[]>([]);
  const [adminEntryCounts, setAdminEntryCounts] = useState<Map<string, number>>(new Map());
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [switchOwnerTarget, setSwitchOwnerTarget] = useState<DisplayForm | null>(null);
  const [optionsOpenId, setOptionsOpenId] = useState<string | null>(null);

  const loadForms = useAdminStore((s) => s.loadForms);

  const reloadAdminData = useCallback(() => {
    if (dataMode !== 'admin') return;
    setLoadingAdmin(true);
    Promise.all([loadForms(ownerIdParam), fetchEntryFormTitles(ownerIdParam)])
      .then(([forms, formTitles]) => {
        setAdminForms(forms);
        const counts = new Map<string, number>();
        for (const formTitle of formTitles) {
          counts.set(formTitle, (counts.get(formTitle) ?? 0) + 1);
        }
        setAdminEntryCounts(counts);
      })
      .catch((e) => console.warn('[dashboard] failed to load admin forms/entries', e))
      .finally(() => setLoadingAdmin(false));
  }, [dataMode, ownerIdParam, loadForms]);

  useEffect(() => {
    reloadAdminData();
  }, [reloadAdminData]);

  // Same ownership rule already used by the native home/entries screens:
  // only this account's forms, plus any not-yet-claimed local ones.
  const ownedLocalForms = useMemo(
    () =>
      localCustomForms
        .filter((f) => (userId ? f.userId === userId || f.userId == null : f.userId == null))
        .filter((f) => f.config?.formTitle && f.config?.fields),
    [localCustomForms, userId],
  );
  const ownedLocalEntries = useMemo(
    () => localEntries.filter((e) => (userId ? e.userId === userId || e.userId == null : e.userId == null)),
    [localEntries, userId],
  );
  const localEntryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of ownedLocalEntries) {
      if (!entry.formTitle) continue;
      counts.set(entry.formTitle, (counts.get(entry.formTitle) ?? 0) + 1);
    }
    return counts;
  }, [ownedLocalEntries]);

  const displayForms: DisplayForm[] = useMemo(() => {
    if (dataMode === 'admin') {
      return adminForms.map((f) => ({
        key: f.dbId,
        config: f.schema,
        ownerId: f.userId,
        ownerLabel: f.userId === userId ? undefined : (profiles.find((p) => p.id === f.userId)?.email ?? f.userId),
        admin: f,
      }));
    }
    return ownedLocalForms.map((f) => ({
      key: f.importId,
      config: f.config,
      ownerId: f.userId ?? userId ?? '',
      local: f,
    }));
  }, [dataMode, adminForms, ownedLocalForms, profiles, userId]);

  const entryCountFor = (form: DisplayForm): number =>
    dataMode === 'admin'
      ? adminEntryCounts.get(form.config.formTitle) ?? 0
      : localEntryCounts.get(form.config.formTitle) ?? 0;

  const openEntries = (form: DisplayForm) => {
    const params =
      dataMode === 'admin'
        ? `formId=${encodeURIComponent(form.key)}&source=admin&owner=${encodeURIComponent(form.ownerId)}`
        : `formId=${encodeURIComponent(form.key)}&source=local`;
    router.push(`/entries?${params}`);
  };

  const openExport = (form: DisplayForm) => {
    const params =
      dataMode === 'admin'
        ? `formId=${encodeURIComponent(form.key)}&source=admin&owner=${encodeURIComponent(form.ownerId)}`
        : `formId=${encodeURIComponent(form.key)}&source=local`;
    router.push(`/export?${params}`);
  };

  const duplicateForm = (form: DisplayForm) => {
    useFormDraftStore.getState().setDuplicateSeed(form.config);
    router.push('/form-builder');
  };

  const handleDelete = (form: DisplayForm) => {
    showDialog({
      title: 'Delete form?',
      message: `${form.config.formTitle} and everything collected under it will be removed.`,
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (form.local) {
              removeCustomForm(form.local.importId);
              clearEntries({ formTitle: form.config.formTitle, userId });
            } else if (form.admin) {
              deleteFormAdmin({ dbId: form.admin.dbId })
                .then(() => {
                  useAdminStore.getState().invalidateAdminData();
                  reloadAdminData();
                })
                .catch((e) => console.warn('[dashboard] failed to delete form', e));
            }
          },
        },
      ],
    });
  };

  const handleSwitchOwner = (newOwnerId: string) => {
    const form = switchOwnerTarget;
    setSwitchOwnerTarget(null);
    if (!form?.admin) return;
    switchFormOwner({ dbId: form.admin.dbId }, newOwnerId)
      .then(() => {
        useAdminStore.getState().invalidateAdminData();
        reloadAdminData();
      })
      .catch((e) => console.warn('[dashboard] failed to switch owner', e));
  };

  const handleImportJson = async () => {
    setCreateMenuOpen(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
      });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      
      let jsonText = '';
      if (file.file) {
        jsonText = await file.file.text();
      } else {
        const response = await fetch(file.uri);
        jsonText = await response.text();
      }
      
      const config = JSON.parse(jsonText);
      if (!config.formId || !config.formTitle || !Array.isArray(config.fields)) {
        throw new Error('Invalid form schema structure');
      }
      
      const importId = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      addCustomForm(config, importId, userId);
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    }
  };

  if (!ready) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={() => { setCreateMenuOpen(false); setOptionsOpenId(null); }}>
      <View style={styles.root}>
        <DashboardNav />
      <ScrollView contentContainerStyle={[styles.content, isNarrow && styles.contentNarrow]}>
        <PageHeader 
          kicker="DATA COLLECTION" 
          title="Forms" 
          subtitle="Manage your forms and view collected data."
        >
          <View style={styles.createGroup}>
            <TouchableOpacity style={styles.createBtnMain} onPress={() => router.push({ pathname: '/form-builder', params: { template: 'blank' } })}>
              <MaterialIcons name="add" size={18} color={colors.text.inverse} />
              <Text style={styles.createBtnLabel}>Create form</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.createBtnSplit} onPress={() => setCreateMenuOpen(!createMenuOpen)}>
              <MaterialIcons name="arrow-drop-down" size={20} color={colors.text.inverse} />
            </TouchableOpacity>
            {createMenuOpen && (
              <View style={styles.createMenu}>
                <TouchableOpacity style={styles.createMenuOption} onPress={() => { setCreateMenuOpen(false); router.push({ pathname: '/form-builder', params: { template: 'blank' } }); }}>
                  <MaterialIcons name="insert-drive-file" size={16} color={colors.text.secondary} />
                  <Text style={styles.createMenuOptionText}>Blank form</Text>
                </TouchableOpacity>
                {FORM_TEMPLATES.map((tmpl) => (
                  <TouchableOpacity key={tmpl.key} style={styles.createMenuOption} onPress={() => { setCreateMenuOpen(false); router.push({ pathname: '/form-builder', params: { template: tmpl.key } }); }}>
                    <MaterialIcons name="assignment" size={16} color={colors.text.secondary} />
                    <Text style={styles.createMenuOptionText}>{tmpl.label}</Text>
                  </TouchableOpacity>
                ))}
                <View style={{ height: 1, backgroundColor: colors.border.soft, marginVertical: 4 }} />
                <TouchableOpacity style={styles.createMenuOption} onPress={handleImportJson}>
                  <MaterialIcons name="file-upload" size={16} color={colors.text.secondary} />
                  <Text style={styles.createMenuOptionText}>Import JSON</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </PageHeader>
        {loadingAdmin ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.brand.primary} />
          </View>
        ) : displayForms.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="description" size={40} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>No forms yet</Text>
            <Text style={styles.emptyHint}>
              Forms created or imported on the mobile app will appear here once signed in and synced.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {displayForms.map((form) => {
              const count = entryCountFor(form);
              return (
                <TouchableOpacity
                  key={form.key}
                  style={[styles.card, isNarrow && styles.cardNarrow, { zIndex: optionsOpenId === form.key ? 100 : 1 }]}
                  activeOpacity={0.6}
                  onPress={() => openEntries(form)}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.cardHeaderLeft}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{form.config.formTitle || 'Untitled Form'}</Text>
                        {form.ownerLabel ? (
                          <Text style={styles.cardOwner} numberOfLines={1}>{form.ownerLabel}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity 
                        style={styles.cardOptionsBtn} 
                        onPress={(e) => {
                          e.stopPropagation();
                          setOptionsOpenId(optionsOpenId === form.key ? null : form.key);
                        }}
                      >
                        <MaterialIcons name="more-vert" size={20} color={colors.text.secondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.cardBottom}>
                    <View style={styles.metaBadge}>
                      <MaterialIcons name="format-list-bulleted" size={14} color={colors.text.secondary} />
                      <Text style={styles.cardMeta}>{form.config.fields.length} {form.config.fields.length === 1 ? 'field' : 'fields'}</Text>
                    </View>
                    <View style={[styles.metaBadge, count > 0 && styles.metaBadgeActive]}>
                      <MaterialIcons name="inbox" size={14} color={count > 0 ? colors.brand.primary : colors.text.secondary} />
                      <Text style={[styles.cardMeta, count > 0 && styles.cardMetaActive]}>{count} {count === 1 ? 'entry' : 'entries'}</Text>
                    </View>
                  </View>

                  {optionsOpenId === form.key && (
                    <View style={styles.cardOptionsMenu}>
                      <TouchableOpacity style={styles.cardMenuOption} onPress={(e) => { e.stopPropagation(); setOptionsOpenId(null); openExport(form); }}>
                        <MaterialIcons name="ios-share" size={16} color={colors.text.secondary} />
                        <Text style={styles.cardMenuOptionText}>Export CSV</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.cardMenuOption} onPress={(e) => { e.stopPropagation(); setOptionsOpenId(null); downloadJson(form.config); }}>
                        <MaterialIcons name="download" size={16} color={colors.text.secondary} />
                        <Text style={styles.cardMenuOptionText}>Download JSON</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.cardMenuOption} onPress={(e) => { e.stopPropagation(); setOptionsOpenId(null); duplicateForm(form); }}>
                        <MaterialIcons name="content-copy" size={16} color={colors.text.secondary} />
                        <Text style={styles.cardMenuOptionText}>Duplicate form</Text>
                      </TouchableOpacity>
                      {form.admin ? (
                        <TouchableOpacity style={styles.cardMenuOption} onPress={(e) => { e.stopPropagation(); setOptionsOpenId(null); setSwitchOwnerTarget(form); }}>
                          <MaterialIcons name="swap-horiz" size={16} color={colors.text.secondary} />
                          <Text style={styles.cardMenuOptionText}>Transfer owner</Text>
                        </TouchableOpacity>
                      ) : null}
                      <View style={styles.menuDivider} />
                      <TouchableOpacity style={styles.cardMenuOption} onPress={(e) => { e.stopPropagation(); setOptionsOpenId(null); handleDelete(form); }}>
                        <MaterialIcons name="delete-outline" size={16} color={colors.text.danger} />
                        <Text style={[styles.cardMenuOptionText, { color: colors.text.danger }]}>Delete form</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <SwitchOwnerModal
        visible={!!switchOwnerTarget}
        formTitle={switchOwnerTarget?.config.formTitle ?? ''}
        profiles={profiles}
        currentOwnerId={switchOwnerTarget?.ownerId ?? ''}
        onClose={() => setSwitchOwnerTarget(null)}
        onSelect={handleSwitchOwner}
      />
      </View>
    </TouchableWithoutFeedback>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.app },
  center: { alignItems: 'center', justifyContent: 'center' },

  content: {
    paddingHorizontal: 40,
    paddingVertical: 40,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  contentNarrow: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  createGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
    position: 'relative',
    zIndex: 100,
  },
  createBtnMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.action.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.1)',
  },
  createBtnSplit: {
    backgroundColor: colors.action.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  createMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    backgroundColor: colors.background.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    minWidth: 200,
  },
  createMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  createMenuOptionText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  createBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.inverse,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 100,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: 20,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  card: {
    width: 320,
    backgroundColor: colors.background.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    padding: 0,
    position: 'relative',
    minHeight: 140,
    justifyContent: 'space-between',
  },
  cardNarrow: {
    width: '100%',
  },
  cardTop: {
    padding: 20,
    paddingBottom: 16,
  },
  cardBottom: {
    padding: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background.soft,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flex: 1,
    paddingRight: 12,
    gap: 6,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
    lineHeight: 22,
  },
  cardOwner: {
    fontSize: 12,
    color: colors.text.muted,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  metaBadgeActive: {
    backgroundColor: colors.brand.primarySoft,
    borderColor: 'transparent',
  },
  cardMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  cardMetaActive: {
    color: colors.brand.primary,
  },
  cardOptionsBtn: {
    padding: 6,
    marginRight: -6,
    marginTop: -6,
  },
  cardOptionsMenu: {
    position: 'absolute',
    top: 50,
    right: 16,
    backgroundColor: colors.background.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    minWidth: 180,
    zIndex: 50,
    overflow: 'hidden',
  },
  cardMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardMenuOptionText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border.soft,
    marginVertical: 4,
  },
});
