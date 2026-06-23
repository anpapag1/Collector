import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';
import ScreenBubbles from '../components/ScreenBubbles';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const authUser = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenBubbles />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>

        {authUser ? (
          <TouchableOpacity style={styles.row} onPress={handleSignOut}>
            <MaterialIcons name="logout" size={22} color={colors.text.secondary} />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Sign out</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{authUser.email}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.row} onPress={() => router.push('/(auth)/login')}>
            <MaterialIcons name="login" size={22} color={colors.text.secondary} />
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.app,
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
    color: colors.text.primary,
  },
  section: {
    marginTop: 12,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.text.secondary,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: colors.border.default,
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
    color: colors.text.primary,
  },
  rowSub: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 1,
  },
});
