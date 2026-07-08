import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Profile } from '../../services/adminService';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';
import { AppColors } from '../../theme/colors';
import { blurActiveElement } from '../../utils/webA11y';

// Admin-only "Switch owner" picker — mirrors Collector-Web's
// openSwitchOwnerModal/renderSwitchOwnerList (dashboard.js:439-473). No
// native equivalent; styled with theme/colors.ts like every other dialog in
// the app (DialogHost, etc.).
export default function SwitchOwnerModal({
  visible,
  formTitle,
  profiles,
  currentOwnerId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  formTitle: string;
  profiles: Profile[];
  currentOwnerId: string;
  onClose: () => void;
  onSelect: (userId: string) => void;
}) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState('');

  const candidates = useMemo(() => {
    const others = profiles.filter((p) => p.id !== currentOwnerId);
    const q = query.trim().toLowerCase();
    return q ? others.filter((p) => p.email.toLowerCase().includes(q)) : others;
  }, [profiles, currentOwnerId, query]);

  // The search input is autoFocus, so it's very often still focused right
  // when this modal closes — blur it first, or react-native-web's Modal
  // marking its now-hidden container aria-hidden while focus is still
  // inside triggers a browser accessibility warning.
  const handleClose = () => {
    blurActiveElement();
    onClose();
  };
  const handleSelect = (userId: string) => {
    blurActiveElement();
    onSelect(userId);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>Move "{formTitle}"</Text>
            <TouchableOpacity onPress={handleClose}>
              <MaterialIcons name="close" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.search}
            placeholder="Search users…"
            placeholderTextColor={colors.text.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          <ScrollView style={styles.list}>
            {candidates.length === 0 ? (
              <Text style={styles.empty}>
                {profiles.length ? 'No users match your search.' : 'No other users to move this form to.'}
              </Text>
            ) : (
              candidates.map((p) => (
                <TouchableOpacity key={p.id} style={styles.option} onPress={() => handleSelect(p.id)}>
                  <Text style={styles.optionLabel}>{p.email}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.overlay.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: colors.background.white,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  search: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.input,
    backgroundColor: colors.background.fieldSoft,
    fontSize: 14,
    color: colors.text.primary,
  },
  list: {
    maxHeight: 280,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  optionLabel: {
    fontSize: 14,
    color: colors.text.primary,
  },
  empty: {
    fontSize: 13,
    color: colors.text.secondary,
    paddingVertical: 12,
    textAlign: 'center',
  },
});
