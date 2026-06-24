import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable, FlatList } from 'react-native-gesture-handler';
import { useEntriesStore } from '../store/entriesStore';
import EntryCard from '../components/EntryCard';
import Toast from '../components/Toast';
import type { Entry } from '../types';
import { getEntryDisplayNumbers } from '../utils/entryNumbering';
import { AppColors } from '../theme/colors';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';

const SWIPE_ACTION_WIDTH = 80;
const SNACKBAR_TIMEOUT_MS = 2600;
const TOAST_BOTTOM_OFFSET = 24;
const LIST_BOTTOM_PADDING = 32;

export default function EntriesScreen() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);

  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeRefs = useRef<Map<string, Swipeable>>(new Map());

  const showSnack = useCallback((msg: string) => {
    setSnackbar(msg);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar(null), SNACKBAR_TIMEOUT_MS);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      swipeRefs.current.get(id)?.close();
      deleteEntry(id);
      showSnack('Entry deleted');
    },
    [deleteEntry, showSnack],
  );

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.createdAt - a.createdAt),
    [entries],
  );
  const displayNumbers = useMemo(() => getEntryDisplayNumbers(entries), [entries]);

  const renderRightActions = (id: string, progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [SWIPE_ACTION_WIDTH, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(id)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="delete" size={24} color={colors.text.inverse} />
          <Text style={styles.deleteLabel}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderItem = ({ item }: { item: Entry }) => (
    <Swipeable
      ref={(ref) => {
        if (ref) swipeRefs.current.set(item.id, ref);
        else swipeRefs.current.delete(item.id);
      }}
      renderRightActions={(progress) => renderRightActions(item.id, progress)}
      overshootRight={false}
      friction={2}
    >
      <EntryCard
        entry={item}
        displayNumber={displayNumbers.get(item.id) ?? 0}
        onOpen={() => router.push(`/entry/${item.id}`)}
        showCoords
      />
    </Swipeable>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>All entries</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/export')}>
          <MaterialIcons name="ios-share" size={23} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: LIST_BOTTOM_PADDING + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <Text style={styles.countLabel}>
            {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'} · newest first
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="inventory" size={46} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>No entries yet</Text>
            <Text style={styles.emptyHint}>
              Tap "New entry" on the home screen to get started.
            </Text>
          </View>
        }
      />

      <Toast message={snackbar} onDismiss={() => setSnackbar(null)} bottom={TOAST_BOTTOM_OFFSET + insets.bottom} />
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

  listContent: {
    paddingHorizontal: 16,
  },

  countLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
    marginBottom: 12,
    marginTop: 2,
    marginLeft: 2,
  },

  separator: { height: 10 },

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
  emptyHint: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
  },

  deleteAction: {
    width: 88,
    justifyContent: 'center',
    alignItems: 'stretch',
    marginLeft: 6,
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: colors.action.danger,
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

});
