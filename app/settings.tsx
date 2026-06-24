import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useEntriesStore } from '../store/entriesStore';
import { colors } from '../theme/colors';
import ScreenBubbles from '../components/ScreenBubbles';
import ThemeToggle from '../components/ThemeToggle';
import { useThemeStore } from '../store/themeStore';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const isDark = themeMode === 'dark';
  const styles = useMemo(() => createStyles(isDark), [isDark]);
  const authUser = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const entries = useEntriesStore((s) => s.entries);
  const clearLocalOnly = useEntriesStore((s) => s.clearLocalOnly);

  const handleSignOut = () => {
    if (entries.length === 0) {
      signOut();
      return;
    }
    Alert.alert(
      'Entries on this device',
      `You have ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} stored locally. Keep them on this device for offline use, or delete them now? (Anything already synced stays safe in your account either way.)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete from device',
          style: 'destructive',
          onPress: () => {
            clearLocalOnly();
            signOut();
          },
        },
        { text: 'Keep offline', onPress: () => signOut() },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {!isDark && <ScreenBubbles />}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={isDark ? '#F7FBFE' : colors.text.primary}
          />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.appearanceCard}>
          <ThemeToggle mode={themeMode} onChange={setThemeMode} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>

        {authUser ? (
          <TouchableOpacity style={styles.row} onPress={handleSignOut}>
            <MaterialIcons
              name="logout"
              size={22}
              color={isDark ? '#A4B7C1' : colors.text.secondary}
            />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Sign out</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{authUser.email}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.row} onPress={() => router.push('/(auth)/login')}>
            <MaterialIcons
              name="login"
              size={22}
              color={isDark ? '#A4B7C1' : colors.text.secondary}
            />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Sign in</Text>
              <Text style={styles.rowSub}>Sync your entries across devices</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (isDark: boolean) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: isDark ? '#050708' : colors.background.app,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: isDark ? '#F7FBFE' : colors.text.primary,
  },
  section: {
    marginTop: 12,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: isDark ? '#91A9B7' : colors.text.secondary,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: isDark ? '#101B21' : colors.background.white,
    borderWidth: 1,
    borderColor: isDark ? '#203744' : colors.border.default,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: isDark ? '#F7FBFE' : colors.text.primary,
  },
  rowSub: {
    fontSize: 12,
    color: isDark ? '#A4B7C1' : colors.text.secondary,
    marginTop: 1,
  },
  appearanceCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? '#203744' : colors.border.default,
    backgroundColor: isDark ? '#101B21' : colors.background.white,
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
});
