import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, ActivityIndicator, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';
import { AppColors } from '../theme/colors';
import DashboardNav from '../components/dashboard/DashboardNav';
import PageHeader from '../components/dashboard/PageHeader';
import Toast from '../components/Toast';
import { useRequireWebSession } from '../components/dashboard/useRequireWebSession';
import { useAppSettingsStore } from '../store/appSettingsStore';
import { updateAppSettings } from '../services/appSettingsService';

// Admin-only web dashboard page — overrides native app/settings.tsx on web.
// Controls network-wide settings (currently just entry-preview thumbnails):
// one value that changes what every user/device sees, not a per-user
// preference, so it's gated to admins by both this page (cosmetic) and the
// app_settings RLS UPDATE policy (the actual enforcement — see
// services/appSettingsService.ts).
export default function DashboardSettings() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const { ready, isAdmin } = useRequireWebSession();

  const showEntryPreviews = useAppSettingsStore((s) => s.showEntryPreviews);
  const setShowEntryPreviews = useAppSettingsStore((s) => s.setShowEntryPreviews);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleToggle = (value: boolean) => {
    setSaving(true);
    updateAppSettings({ showEntryPreviews: value })
      .then(() => {
        // Confirm-then-update, not optimistic — this changes what every
        // user sees, so the switch shouldn't claim success before the
        // write (and the RLS check behind it) actually lands.
        setShowEntryPreviews(value);
        setToast(value ? 'Entry previews turned on for everyone' : 'Entry previews turned off for everyone');
      })
      .catch((e) => {
        console.warn('[settings] failed to update app settings', e);
        setToast(e instanceof Error ? e.message : 'Could not save the change');
      })
      .finally(() => setSaving(false));
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
        <PageHeader
          kicker="ADMIN"
          title="Settings"
          subtitle="Network-wide settings that apply to every user."
        />

        {!isAdmin ? (
          <View style={styles.card}>
            <View style={styles.empty}>
              <MaterialIcons name="lock-outline" size={40} color={colors.text.muted} />
              <Text style={styles.emptyTitle}>Admins only</Text>
              <Text style={styles.emptySub}>You don't have permission to view this page.</Text>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.row}>
              <MaterialIcons name="image" size={22} color={colors.text.secondary} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Entry photo previews</Text>
                <Text style={styles.rowSub}>
                  Show a photo thumbnail on entry cards, for every user. Turning this off stops
                  fetching photo previews entirely (native and web).
                </Text>
              </View>
              {saving ? (
                <ActivityIndicator color={colors.brand.primary} />
              ) : (
                <Switch
                  value={showEntryPreviews}
                  onValueChange={handleToggle}
                  trackColor={{ false: colors.border.default, true: colors.brand.primary }}
                  thumbColor={colors.background.white}
                />
              )}
            </View>
          </View>
        )}
      </ScrollView>
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </View>
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
    gap: 20,
  },

  card: {
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: colors.border.section,
    borderRadius: 20,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 20,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  rowSub: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  emptySub: {
    fontSize: 13,
    color: colors.text.secondary,
  },
});
