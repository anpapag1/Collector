import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../../store/entriesStore';
import { isFieldFilled, isFieldVisible } from '../../utils/formLogic';
import DynamicForm from '../../components/DynamicForm';
import Toast from '../../components/Toast';
import { PhotoItem } from '../../types';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

export default function EditEntryScreen() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entries = useEntriesStore((s) => s.entries);
  const updateEntry = useEntriesStore((s) => s.updateEntry);

  const entry = entries.find((e) => e.id === id);

  const [draft, setDraft] = useState(entry?.data ?? {});
  const [showErrors, setShowErrors] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Photos and GPS aren't editable yet — fixing a typo shouldn't risk the
  // location/photos captured at collection time. Only render the rest.
  const editableFields = useMemo(
    () => (entry?.fields ?? []).filter((f) => f.type !== 'image' && f.type !== 'gps'),
    [entry]
  );
  const readOnlyFields = useMemo(
    () => (entry?.fields ?? []).filter((f) => f.type === 'image' || f.type === 'gps'),
    [entry]
  );

  const handleFieldChange = useCallback((fieldId: string, value: any) => {
    setDraft((d) => ({ ...d, [fieldId]: value }));
  }, []);

  const handleSave = useCallback(() => {
    if (!entry) return;
    const requiredFields = editableFields
      .filter((f) => f.required)
      .filter((f) => isFieldVisible(f, draft));
    const hasUnfilled = requiredFields.some((f) => !isFieldFilled(f, draft[f.id]));
    if (hasUnfilled) {
      setShowErrors(true);
      setSnackbar('Fill in all required fields');
      return;
    }
    updateEntry(entry.id, draft);
    router.back();
  }, [entry, editableFields, draft, updateEntry]);

  if (!entry) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="inventory" size={40} color={colors.text.muted} />
        <Text style={styles.notFound}>Entry not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.inner, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Edit entry</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <DynamicForm
            fields={editableFields}
            draft={draft}
            showErrors={showErrors}
            onFieldChange={handleFieldChange}
            onAddPhotoPress={() => {}}
            gpsStatus="idle"
          />

          {readOnlyFields.length > 0 && (
            <View style={styles.readOnlySection}>
              <Text style={styles.readOnlyHint}>
                Photos and GPS were captured at collection time and can't be edited here.
              </Text>
              {readOnlyFields.map((field) => (
                <ReadOnlyField key={field.id} field={field} value={entry.data[field.id]} />
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.saveBar, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <MaterialIcons name="check" size={22} color={colors.text.inverse} />
            <Text style={styles.saveBtnText}>Save changes</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Toast message={snackbar} onDismiss={() => setSnackbar(null)} bottom={96 + insets.bottom} icon="error-outline" />
    </KeyboardAvoidingView>
  );
}

function ReadOnlyField({ field, value }: { field: { id: string; type: string; label: string }; value: any }) {
  const styles = useThemedStyles(createStyles);
  if (field.type === 'image') {
    const photos: PhotoItem[] = Array.isArray(value) ? value : [];
    if (photos.length === 0) return null;
    return (
      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label} ({photos.length})</Text>
        <View style={styles.photoGrid}>
          {photos.map((ph) => (
            <View key={ph.id} style={styles.photoTile}>
              <Image source={{ uri: ph.uri }} style={styles.photoImage} resizeMode="cover" />
            </View>
          ))}
        </View>
      </View>
    );
  }
  if (field.type === 'gps') {
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
    return (
      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {hasLocation && value?.address ? (
          <Text style={styles.fieldValue}>{value.address}</Text>
        ) : null}
        <Text style={styles.fieldValue}>
          {hasLocation ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'No location captured'}
        </Text>
      </View>
    );
  }
  return null;
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.app },
  inner: { flex: 1 },

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
  screenTitle: {
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
    paddingBottom: 110,
    gap: 20,
  },

  readOnlySection: {
    gap: 12,
  },
  readOnlyHint: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },

  fieldCard: {
    backgroundColor: colors.background.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.text.secondary,
  },
  fieldValue: {
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 22,
  },

  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoTile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.border.section,
  },
  photoImage: { width: '100%', height: '100%' },

  saveBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    paddingTop: 10,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: colors.action.primary,
    shadowColor: colors.shadow.brand,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.inverse,
  },
});
