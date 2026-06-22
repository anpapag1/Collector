import { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable, FlatList } from 'react-native-gesture-handler';
import { useEntriesStore } from '../store/entriesStore';
import EntryCard from '../components/EntryCard';
import type { Entry } from '../types';

export default function EntriesScreen() {
  const insets = useSafeAreaInsets();
  const entries = useEntriesStore((s) => s.entries);
  const deleteEntry = useEntriesStore((s) => s.deleteEntry);

  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeRefs = useRef<Map<string, Swipeable>>(new Map());

  const showSnack = useCallback((msg: string) => {
    setSnackbar(msg);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar(null), 2600);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      swipeRefs.current.get(id)?.close();
      deleteEntry(id);
      showSnack('Entry deleted');
    },
    [deleteEntry, showSnack],
  );

  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);

  const renderRightActions = (id: string, progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(id)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="delete" size={24} color="#fff" />
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
          <MaterialIcons name="arrow-back" size={24} color="#171d1b" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>All entries</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/export')}>
          <MaterialIcons name="ios-share" size={23} color="#171d1b" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <Text style={styles.countLabel}>
            {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'} · newest first
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="inventory" size={46} color="#9fb3ad" />
            <Text style={styles.emptyTitle}>No entries yet</Text>
            <Text style={styles.emptyHint}>
              Tap "New entry" on the home screen to get started.
            </Text>
          </View>
        }
      />

      {/* Snackbar */}
      {snackbar && (
        <View style={[styles.snackbar, { bottom: 24 + insets.bottom }]}>
          <MaterialIcons name="check-circle" size={20} color="#83d5c6" />
          <Text style={styles.snackText}>{snackbar}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4fbf8' },

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
    color: '#171d1b',
    paddingLeft: 4,
  },

  listContent: {
    paddingHorizontal: 16,
  },

  countLabel: {
    fontSize: 12,
    color: '#3f4946',
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
    color: '#171d1b',
  },
  emptyHint: {
    fontSize: 13,
    color: '#3f4946',
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
    backgroundColor: '#ba1a1a',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },

  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2f3330',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 8,
  },
  snackText: { fontSize: 14, color: '#eef1ee', flex: 1 },
});
