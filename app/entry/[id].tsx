import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { showDialog } from '../../store/dialogStore';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../../store/entriesStore';
import { formatDate, timeAgo } from '../../utils/timeUtils';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';
import { getEntryDisplayNumbers } from '../../utils/entryNumbering';
import EntryDetailFields from '../../components/dashboard/EntryDetailFields';

export default function EntryDetailScreen() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);

  const entry = entries.find((e) => e.id === id);
  const displayNumbers = useMemo(() => getEntryDisplayNumbers(entries), [entries]);

  if (!entry) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="inventory" size={40} color={colors.text.muted} />
        <Text style={styles.notFound}>Entry not found</Text>
      </View>
    );
  }

  const { data, createdAt, formTitle, fields } = entry;
  const displayNumber = displayNumbers.get(entry.id) ?? 0;

  const handleDelete = () => {
    showDialog({
      title: 'Delete entry?',
      message: `Entry #${String(displayNumber).padStart(2, '0')} will be permanently removed.`,
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteEntry(entry.id);
            router.back();
          },
        },
      ],
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.topLabel}>Entry #{String(displayNumber).padStart(2, '0')}</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push(`/edit-entry/${entry.id}`)}
        >
          <MaterialIcons name="edit" size={22} color={colors.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, styles.deleteBtn]}
          onPress={handleDelete}
        >
          <MaterialIcons name="delete-outline" size={22} color={colors.text.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            {formTitle ? (
              <View style={styles.formChip}>
                <MaterialIcons name="description" size={13} color={colors.brand.primary} />
                <Text style={styles.formChipText}>{formTitle}</Text>
              </View>
            ) : null}
            <Text style={styles.headerAgo}>{timeAgo(createdAt)}</Text>
          </View>
          <Text style={styles.headerDate}>{formatDate(createdAt)}</Text>
        </View>

        {/* Dynamic fields */}
        <EntryDetailFields entry={entry} onOpenMap={(entryId) => router.push(`/map/${entryId}`)} />

        {/* Footer meta */}
        <View style={styles.metaFooter}>
          <Text style={styles.metaRow}>
            <Text style={styles.metaKey}>Entry ID  </Text>
            <Text style={styles.metaMono}>{entry.id}</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.app },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  iconBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  deleteBtn: {
    backgroundColor: colors.background.dangerSoft,
  },
  topLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },

  notFound: { fontSize: 15, color: colors.text.secondary, marginTop: 12 },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },

  // Header card
  headerCard: {
    backgroundColor: colors.background.elevatedGreen,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.background.elevatedGreen,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  formChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.brandDark,
  },
  headerAgo: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  headerDate: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.primary,
    marginTop: 4,
  },

  // Footer
  metaFooter: {
    paddingHorizontal: 4,
    paddingTop: 4,
    gap: 4,
  },
  metaRow: {
    fontSize: 12,
  },
  metaKey: {
    color: colors.text.secondary,
    fontWeight: '500',
  },
  metaMono: {
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
});
