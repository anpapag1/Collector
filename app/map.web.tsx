import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useEntriesStore } from '../store/entriesStore';
import { usePickerStore } from '../store/pickerStore';
import { entryLocation, googleMapsUrl } from '../utils/mapHelpers';
import { getEntryDisplayNumbers } from '../utils/entryNumbering';
import { previewTitleForEntry } from '../utils/entryPreview';
import { fetchAllEntries } from '../services/adminService';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';
import { AppColors } from '../theme/colors';
import DashboardNav from '../components/dashboard/DashboardNav';
import PageHeader from '../components/dashboard/PageHeader';
import DashboardMap, { DashboardMapPoint } from '../components/dashboard/DashboardMap';
import { useRequireWebSession } from '../components/dashboard/useRequireWebSession';
import type { Entry } from '../types';

// Web-only aggregate map of every GPS-bearing entry across the signed-in
// user's forms (admins: across whichever owner is selected). Native has no
// equivalent at this path (only the dynamic app/map/[id].tsx, scoped to one
// form at a time) so this is a brand new route, not an override — no
// collision with the native map screen.
export default function DashboardMapScreen() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const isNarrow = width < 768;
  const { ready, userId, isAdmin, profiles, ownerFilter, setOwnerFilter, dataMode, ownerIdParam } =
    useRequireWebSession();
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();

  const localAllEntries = useEntriesStore((s) => s.entries);
  const customForms = usePickerStore((s) => s.customForms);

  const [adminEntries, setAdminEntries] = useState<Entry[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(dataMode === 'admin');

  const reloadAdminEntries = useCallback(() => {
    if (dataMode !== 'admin') return;
    setLoadingAdmin(true);
    fetchAllEntries(ownerIdParam)
      .then((entries) =>
        setAdminEntries(
          entries.map((e) => ({
            id: e.localId,
            remoteId: e.remoteId,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            formTitle: e.formTitle ?? undefined,
            fields: e.fields,
            data: e.data,
            userId: e.userId,
            syncStatus: 'synced' as const,
          })),
        ),
      )
      .catch((e) => console.warn('[map] failed to load admin entries', e))
      .finally(() => setLoadingAdmin(false));
  }, [dataMode, ownerIdParam]);

  useEffect(() => {
    reloadAdminEntries();
  }, [reloadAdminEntries]);

  const [formFilter, setFormFilter] = useState<string | null>(null);

  const ownedLocalEntries = useMemo(
    () => localAllEntries.filter((e) => (userId ? e.userId === userId || e.userId == null : e.userId == null)),
    [localAllEntries, userId],
  );
  const allEntries = dataMode === 'admin' ? adminEntries : ownedLocalEntries;

  const formTitles = useMemo(() => {
    if (dataMode === 'admin') {
      return Array.from(new Set(adminEntries.map((e) => e.formTitle).filter((t): t is string => !!t)));
    }
    const titles = new Set<string>();
    for (const f of customForms) {
      if (userId ? f.userId === userId || f.userId == null : f.userId == null) {
        titles.add(f.config.formTitle);
      }
    }
    return Array.from(titles);
  }, [dataMode, adminEntries, customForms, userId]);

  // owner label per form title, best-effort (first matching entry's owner) —
  // only used for the "{title} — {owner}" dropdown label in admin mode.
  const ownerLabelByFormTitle = useMemo(() => {
    if (dataMode !== 'admin') return new Map<string, string>();
    const map = new Map<string, string>();
    for (const e of adminEntries) {
      if (!e.formTitle || map.has(e.formTitle) || !e.userId || e.userId === userId) continue;
      map.set(e.formTitle, profiles.find((p) => p.id === e.userId)?.email ?? e.userId);
    }
    return map;
  }, [dataMode, adminEntries, profiles, userId]);

  const scoped = useMemo(
    () => (formFilter ? allEntries.filter((e) => e.formTitle === formFilter) : allEntries),
    [allEntries, formFilter],
  );

  const displayNumbers = useMemo(() => getEntryDisplayNumbers(scoped), [scoped]);

  const points: DashboardMapPoint[] = useMemo(() => {
    const pts: DashboardMapPoint[] = [];
    for (const entry of scoped) {
      const loc = entryLocation(entry);
      if (!loc) continue;
      const preview = previewTitleForEntry(entry);
      pts.push({
        id: entry.id,
        title: preview ?? `${entry.formTitle ?? 'Entry'} #${String(displayNumbers.get(entry.id) ?? 0).padStart(2, '0')}`,
        subtitle: `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`,
        lat: loc.lat,
        lng: loc.lng,
      });
    }
    return pts;
  }, [scoped, displayNumbers]);

  const [selectedId, setSelectedId] = useState<string | null>(entryId ?? null);

  const [formMenuOpen, setFormMenuOpen] = useState(false);

  if (!ready) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }

  // On narrow viewports the map+sidebar need real height to be usable, more
  // than fits in whatever space is left under the header — so the whole page
  // scrolls instead (matching the pattern app/index.web.tsx already uses).
  // Desktop keeps the original non-scrolling flex:1 layout unchanged.
  const ContentContainer = isNarrow ? ScrollView : View;
  const contentContainerProps = isNarrow
    ? { contentContainerStyle: [styles.content, styles.contentNarrow] }
    : { style: styles.content };

  return (
    <View style={styles.root}>
      <DashboardNav />
      <ContentContainer {...contentContainerProps}>
        <PageHeader
          kicker="LOCATION OVERVIEW"
          title="Map"
          subtitle="See where your field entries were collected."
        >
          <View style={[styles.filterContainer, isNarrow && styles.filterContainerNarrow]}>
            <TouchableOpacity
              style={styles.filterSelect}
              onPress={() => setFormMenuOpen(!formMenuOpen)}
              activeOpacity={0.8}
            >
              <Text style={styles.filterSelectText} numberOfLines={1}>
                {formFilter ? (ownerLabelByFormTitle.get(formFilter) ? `${formFilter} — ${ownerLabelByFormTitle.get(formFilter)}` : formFilter) : 'All forms'}
              </Text>
              <MaterialIcons name={formMenuOpen ? 'expand-less' : 'expand-more'} size={20} color={colors.text.secondary} />
            </TouchableOpacity>

            {formMenuOpen && (
              <View style={styles.filterMenu}>
                <ScrollView style={{ maxHeight: 300 }}>
                  <TouchableOpacity
                    style={[styles.filterOption, !formFilter && styles.filterOptionActive]}
                    onPress={() => { setFormFilter(null); setFormMenuOpen(false); }}
                  >
                    <Text style={[styles.filterOptionText, !formFilter && styles.filterOptionTextActive]}>All forms</Text>
                    {!formFilter && <MaterialIcons name="check" size={18} color={colors.brand.primary} />}
                  </TouchableOpacity>
                  {formTitles.map((title) => {
                    const owner = ownerLabelByFormTitle.get(title);
                    const isActive = formFilter === title;
                    return (
                      <TouchableOpacity
                        key={title}
                        style={[styles.filterOption, isActive && styles.filterOptionActive]}
                        onPress={() => { setFormFilter(title); setFormMenuOpen(false); }}
                      >
                        <Text style={[styles.filterOptionText, isActive && styles.filterOptionTextActive]} numberOfLines={1}>
                          {owner ? `${title} — ${owner}` : title}
                        </Text>
                        {isActive && <MaterialIcons name="check" size={18} color={colors.brand.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </PageHeader>

        {/* Map Container */}
        <View style={[styles.cardWrap, isNarrow && styles.cardWrapNarrow]}>
          {loadingAdmin ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.brand.primary} />
            </View>
          ) : points.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="map" size={40} color={colors.text.muted} />
              <Text style={styles.emptyTitle}>No GPS entries yet</Text>
            </View>
          ) : (
            <>
              <View style={[styles.mapWrap, isNarrow && styles.mapWrapNarrow]}>
                <DashboardMap
                  points={points}
                  selectedId={selectedId}
                  onSelectedIdChange={setSelectedId}
                  onOpenExternal={(id) => {
                    const point = points.find((p) => p.id === id);
                    if (point) window.open(googleMapsUrl(point.lat, point.lng), '_blank');
                  }}
                />
              </View>

              <View style={[styles.sidebar, isNarrow && styles.sidebarNarrow]}>
                <View style={styles.sidebarHeader}>
                  <Text style={styles.sidebarKicker}>VISIBLE ENTRIES</Text>
                  <Text style={styles.sidebarCount}>{points.length} locations</Text>
                </View>

                <ScrollView style={styles.sidebarScroll} contentContainerStyle={styles.sidebarScrollContent}>
                  {points.map((p, i) => {
                    const active = p.id === selectedId;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.entryCard, active && styles.entryCardActive]}
                        onPress={() => setSelectedId(p.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.entryTitle, active && styles.entryTitleActive]} numberOfLines={2}>
                          {i + 1}. {p.title}
                        </Text>
                        <Text style={styles.entrySubtitle} numberOfLines={1}>{p.subtitle}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </>
          )}
        </View>
      </ContentContainer>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.app },
  center: { alignItems: 'center', justifyContent: 'center' },

  content: {
    flex: 1,
    paddingHorizontal: 40,
    paddingVertical: 40,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  contentNarrow: {
    flex: 0,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },

  filterContainer: {
    position: 'relative',
    width: 260,
  },
  filterContainerNarrow: {
    width: '100%',
  },
  filterSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
  },
  filterSelectText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    flex: 1,
  },
  filterMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    backgroundColor: colors.background.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    zIndex: 100,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterOptionActive: {
    backgroundColor: colors.brand.primarySoft,
  },
  filterOptionText: {
    fontSize: 14,
    color: colors.text.primary,
    flex: 1,
  },
  filterOptionTextActive: {
    fontWeight: '600',
    color: colors.brand.primary,
  },

  cardWrap: {
    flex: 1,
    minHeight: 500,
    flexDirection: 'row',
    backgroundColor: colors.background.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardWrapNarrow: {
    // `cardWrap`'s `flex: 1` expands to flexBasis: 0%, which would otherwise
    // make the flex layout ignore the explicit height below — flexGrow/
    // flexShrink/flexBasis have to be reset individually to cancel it.
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    flexDirection: 'column',
    height: 560,
    minHeight: 0,
  },

  mapWrap: {
    flex: 1,
  },
  mapWrapNarrow: {
    flex: 2,
    minHeight: 260,
  },

  sidebar: {
    width: 320,
    borderLeftWidth: 1,
    borderLeftColor: colors.border.soft,
    backgroundColor: colors.background.white,
    flexDirection: 'column',
  },
  sidebarNarrow: {
    width: '100%',
    flex: 1,
    borderLeftWidth: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
  },
  sidebarHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.soft,
    backgroundColor: colors.background.white,
  },
  sidebarKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sidebarCount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 4,
  },

  sidebarScroll: {
    flex: 1,
  },
  sidebarScrollContent: {
    padding: 16,
    gap: 12,
  },

  entryCard: {
    backgroundColor: colors.background.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  entryCardActive: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primarySoft,
  },
  entryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 18,
    marginBottom: 4,
  },
  entryTitleActive: {
    color: colors.brand.primary,
  },
  entrySubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
});
