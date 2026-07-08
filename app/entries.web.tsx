import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { showDialog } from '../store/dialogStore';
import { useEntriesStore } from '../store/entriesStore';
import { usePickerStore } from '../store/pickerStore';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';
import { AppColors } from '../theme/colors';
import { getEntryDisplayNumbers } from '../utils/entryNumbering';
import { selectValueLabel } from '../utils/formLogic';
import { resolveEntryPhotoUrl } from '../utils/photoUrls';
import { updateEntryData, deleteEntryAdmin, AdminEntry } from '../services/adminService';
import { useAdminStore } from '../store/adminStore';
import DashboardNav from '../components/dashboard/DashboardNav';
import EntryCard from '../components/EntryCard';
import EntryDetailFields from '../components/dashboard/EntryDetailFields';
import { useRequireWebSession } from '../components/dashboard/useRequireWebSession';
import type { Entry, PhotoItem } from '../types';

function adminEntryToEntry(ae: AdminEntry): Entry {
  return {
    // The synthetic client-side id (matches `local_id` in Supabase) is what
    // photoStoragePaths()/photoUrls.ts key photo storage paths on — NOT the
    // row's own primary key, which is kept as `remoteId` instead.
    id: ae.localId,
    remoteId: ae.remoteId,
    createdAt: ae.createdAt,
    updatedAt: ae.updatedAt,
    formTitle: ae.formTitle ?? undefined,
    formRemoteId: ae.formRemoteId,
    fields: ae.fields,
    data: ae.data,
    userId: ae.userId,
    syncStatus: 'synced',
  };
}

// Web dashboard entries screen — lists a single form's entries with a text
// search, overriding native app/entries.tsx (which shows the currently
// "active" form's entries with no form-picking param) only on web. Reached
// from the dashboard forms grid via /entries?formId=...&source=local|admin.
export default function DashboardEntries() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const { ready, userId, isAdmin, profiles } = useRequireWebSession();
  const { formId, source, owner } = useLocalSearchParams<{ formId?: string; source?: string; owner?: string }>();
  const isAdminSource = source === 'admin';

  const localAllEntries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);
  const customForms = usePickerStore((s) => s.customForms);

  const localForm = useMemo(
    () => customForms.find((f) => f.importId === formId),
    [customForms, formId],
  );

  const [adminFormTitle, setAdminFormTitle] = useState<string | null>(null);
  const [adminEntries, setAdminEntries] = useState<Entry[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(isAdminSource);

  const loadForms = useAdminStore((s) => s.loadForms);
  const loadEntries = useAdminStore((s) => s.loadEntries);

  const reloadAdminEntries = useCallback(() => {
    if (!isAdminSource || !formId) return;
    setLoadingAdmin(true);
    Promise.all([loadForms(owner), loadEntries(owner)])
      .then(([forms, entries]) => {
        const form = forms.find((f) => f.dbId === formId);
        setAdminFormTitle(form?.formTitle ?? null);
        const title = form?.formTitle;
        setAdminEntries(
          entries.filter((e) => e.formTitle === title).map(adminEntryToEntry),
        );
      })
      .catch((e) => console.warn('[entries] failed to load admin entries', e))
      .finally(() => setLoadingAdmin(false));
  }, [isAdminSource, formId, owner, loadForms, loadEntries]);

  useEffect(() => {
    reloadAdminEntries();
  }, [reloadAdminEntries]);

  const formTitle = isAdminSource ? adminFormTitle : localForm?.config.formTitle ?? null;
  const formFields = isAdminSource ? undefined : localForm?.config.fields;

  const ownedLocalEntries = useMemo(
    () => localAllEntries.filter((e) => (userId ? e.userId === userId || e.userId == null : e.userId == null)),
    [localAllEntries, userId],
  );
  const entries = useMemo(() => {
    if (isAdminSource) return adminEntries;
    return localForm ? ownedLocalEntries.filter((e) => e.formTitle === localForm.config.formTitle) : [];
  }, [isAdminSource, adminEntries, ownedLocalEntries, localForm]);

  const sorted = useMemo(() => [...entries].sort((a, b) => b.createdAt - a.createdAt), [entries]);
  const displayNumbers = useMemo(() => getEntryDisplayNumbers(entries), [entries]);

  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((entry) => {
      const fields = entry.fields ?? formFields ?? [];
      for (const field of fields) {
        const value = entry.data[field.id];
        if (value === undefined || value === null) continue;
        const text = Array.isArray(value)
          ? value.map((v) => (typeof v === 'object' ? selectValueLabel(v) : String(v))).join(' ')
          : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
        if (field.label.toLowerCase().includes(q) || text.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [sorted, query, formFields]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedEntry = useMemo(() => entries.find((e) => e.id === selectedId) ?? null, [entries, selectedId]);

  const [editingJson, setEditingJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const resolvePhotoUri = useCallback(
    (photo: PhotoItem) => {
      if (!selectedEntry?.formRemoteId) return Promise.resolve(null);
      return resolveEntryPhotoUrl(photo, selectedEntry.formRemoteId, selectedEntry.id);
    },
    [selectedEntry],
  );

  // One resolver closure per entry id, cached for the component's lifetime —
  // calling entryCardResolvePhotoUri(entry) inline in JSX would otherwise
  // create a brand-new closure every render (e.g. every keystroke in the
  // search box), which defeats resolveEntryPhotoUrl's own cache by giving
  // EntryCard's effect a new prop identity to re-fire on each time.
  const resolverCacheRef = useRef(new Map<string, (photo: PhotoItem) => Promise<string | null>>());
  const entryCardResolvePhotoUri = useCallback((entry: Entry) => {
    const cache = resolverCacheRef.current;
    let resolver = cache.get(entry.id);
    if (!resolver) {
      resolver = (photo: PhotoItem) => {
        if (!entry.formRemoteId) return Promise.resolve(null);
        return resolveEntryPhotoUrl(photo, entry.formRemoteId, entry.id);
      };
      cache.set(entry.id, resolver);
    }
    return resolver;
  }, []);

  const handleDelete = (entry: Entry) => {
    const num = displayNumbers.get(entry.id) ?? 0;
    showDialog({
      title: 'Delete entry?',
      message: `Entry #${String(num).padStart(2, '0')} will be permanently removed.`,
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (selectedId === entry.id) setSelectedId(null);
            if (isAdminSource) {
              if (!entry.remoteId) return;
              deleteEntryAdmin(entry.remoteId)
                .then(() => {
                  useAdminStore.getState().invalidateAdminData();
                  reloadAdminEntries();
                })
                .catch((e) => console.warn('[entries] failed to delete admin entry', e));
            } else {
              deleteEntry(entry.id);
            }
          },
        },
      ],
    });
  };

  const openEditJson = () => {
    if (!selectedEntry) return;
    setJsonError(null);
    setEditingJson(JSON.stringify(selectedEntry.data, null, 2));
  };

  const saveEditJson = () => {
    if (!selectedEntry?.remoteId || editingJson == null) return;
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(editingJson);
    } catch {
      setJsonError('This must be valid JSON.');
      return;
    }
    updateEntryData(selectedEntry.remoteId, parsed)
      .then(() => {
        useAdminStore.getState().invalidateAdminData();
        setEditingJson(null);
        reloadAdminEntries();
      })
      .catch((e) => setJsonError(e?.message ?? 'Could not save.'));
  };

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
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/')}>
            <MaterialIcons name="arrow-back" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{formTitle ?? 'Entries'}</Text>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => {
              const params = isAdminSource
                ? `formId=${encodeURIComponent(formId ?? '')}&source=admin&owner=${encodeURIComponent(owner ?? '')}`
                : `formId=${encodeURIComponent(formId ?? '')}&source=local`;
              router.push(`/export?${params}`);
            }}
          >
            <MaterialIcons name="ios-share" size={16} color={colors.text.secondary} />
            <Text style={styles.exportBtnLabel}>Export</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search entries…"
            placeholderTextColor={colors.text.muted}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <Text style={styles.countLabel}>
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </Text>

        {loadingAdmin ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.brand.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="inventory" size={40} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>{query ? 'No matching entries' : 'No entries yet'}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                displayNumber={displayNumbers.get(entry.id) ?? 0}
                onOpen={() => setSelectedId(entry.id)}
                resolvePhotoUri={entryCardResolvePhotoUri(entry)}
                ownerLabel={
                  isAdmin && entry.userId && entry.userId !== userId
                    ? profiles.find((p) => p.id === entry.userId)?.email ?? entry.userId
                    : undefined
                }
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selectedEntry} transparent animationType="fade" onRequestClose={() => setSelectedId(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Entry #{String(selectedEntry ? displayNumbers.get(selectedEntry.id) ?? 0 : 0).padStart(2, '0')}
              </Text>
              <View style={styles.modalHeaderActions}>
                {isAdmin && isAdminSource ? (
                  <TouchableOpacity style={styles.editJsonBtn} onPress={openEditJson}>
                    <Text style={styles.editJsonBtnLabel}>Edit JSON</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setSelectedId(null)}>
                  <MaterialIcons name="close" size={22} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {selectedEntry ? (
                <EntryDetailFields
                  entry={selectedEntry}
                  onOpenMap={(entryId) => router.push(`/map?entryId=${entryId}`)}
                  resolvePhotoUri={resolvePhotoUri}
                />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={editingJson != null} transparent animationType="fade" onRequestClose={() => setEditingJson(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.jsonModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit entry JSON</Text>
              <TouchableOpacity onPress={() => setEditingJson(null)}>
                <MaterialIcons name="close" size={22} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.jsonModalBody}>
              <TextInput
                style={styles.jsonInput}
                value={editingJson ?? ''}
                onChangeText={setEditingJson}
                multiline
                textAlignVertical="top"
              />
              {jsonError ? <Text style={styles.jsonError}>{jsonError}</Text> : null}
              <TouchableOpacity style={styles.jsonSaveBtn} onPress={saveEditJson}>
                <Text style={styles.jsonSaveBtnLabel}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.app },
  center: { alignItems: 'center', justifyContent: 'center' },

  content: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  exportBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    outlineStyle: 'none' as any,
  },

  countLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },

  list: {
    gap: 8,
  },

  modalScrim: {
    flex: 1,
    backgroundColor: colors.overlay.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    backgroundColor: colors.background.app,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.background.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.soft,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  editJsonBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  editJsonBtnLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  modalBody: {
    padding: 20,
    gap: 12,
  },

  jsonModalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    backgroundColor: colors.background.app,
    borderRadius: 20,
    overflow: 'hidden',
  },
  jsonModalBody: {
    padding: 20,
    gap: 12,
  },
  jsonInput: {
    minHeight: 260,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.input,
    backgroundColor: colors.background.white,
    fontSize: 13,
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  jsonError: {
    fontSize: 12,
    color: colors.text.danger,
  },
  jsonSaveBtn: {
    backgroundColor: colors.action.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  jsonSaveBtnLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.inverse,
  },
});
