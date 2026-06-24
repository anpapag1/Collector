import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useDialogStore, DialogAction } from '../store/dialogStore';
import { AppColors } from '../theme/colors';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';

// Single app-wide replacement for native Alert.alert (and the old
// Toast-based exit-warning in app/collect.tsx) so every confirmation dialog
// in the app looks and behaves the same way. Mounted once in app/_layout.tsx.
export default function DialogHost() {
  const visible = useDialogStore((s) => s.visible);
  const options = useDialogStore((s) => s.options);
  const hide = useDialogStore((s) => s.hide);
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);

  if (!options) return null;

  const handlePress = (action: DialogAction) => {
    hide();
    action.onPress?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={hide}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>{options.title}</Text>
          {options.message ? <Text style={styles.message}>{options.message}</Text> : null}
          <View style={styles.actions}>
            {options.actions.map((action, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.actionBtn,
                  action.style === 'destructive' && styles.actionDestructive,
                  action.style === 'cancel' && styles.actionCancel,
                ]}
                onPress={() => handlePress(action)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.actionLabel,
                    action.style === 'destructive' && styles.actionLabelDestructive,
                    action.style === 'cancel' && styles.actionLabelCancel,
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
    backgroundColor: colors.background.white,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 10,
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  message: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  actions: {
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.action.primary,
  },
  actionDestructive: {
    backgroundColor: colors.action.delete,
  },
  actionCancel: {
    backgroundColor: colors.background.fieldSoft,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.inverse,
  },
  actionLabelDestructive: {
    color: colors.text.inverse,
  },
  actionLabelCancel: {
    color: colors.text.secondary,
  },
});
