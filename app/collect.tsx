import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { useFormStore } from '../store/formStore';
import { useEntriesStore } from '../store/entriesStore';
import { captureLocation } from '../utils/sensors';
import { PhotoItem } from '../types';
import Toast from '../components/Toast';
import DynamicForm from '../components/DynamicForm';
import { isFieldFilled, isFieldVisible } from '../utils/formLogic';

export default function CollectScreen() {
  const insets = useSafeAreaInsets();
  const schema = useFormStore((s) => s.schema);
  const { draft, draftFormId, gpsStatus, setField, setGpsStatus, resetDraft, showErrors, setShowErrors } =
    useFormStore();
  const addEntry = useEntriesStore((s) => s.addEntry);

  const [savedFlash, setSavedFlash] = useState(false);
  const [exitWarn, setExitWarn] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const initializedRef = useRef(false);

  const showSnack = useCallback((msg: string) => {
    setSnackbar(msg);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar(null), 2600);
  }, []);

  const runGps = useCallback(async () => {
    setGpsStatus('capturing');
    try {
      const loc = await captureLocation();
      if (!isMountedRef.current) return;
      setField('location', loc);
      setGpsStatus('done');
    } catch {
      if (!isMountedRef.current) return;
      setGpsStatus('idle');
    }
  }, [setField, setGpsStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (snackTimer.current) clearTimeout(snackTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!schema || initializedRef.current) return;
    initializedRef.current = true;
    const hasRestoredDraft =
      draftFormId === schema.formId &&
      schema.fields.some((f) => isFieldFilled(f, draft[f.id]));
    if (hasRestoredDraft) return;
    resetDraft();
    const gpsField = schema.fields.find((f) => f.type === 'gps');
    if (gpsField?.auto) runGps();
    schema.fields
      .filter((f) => f.type === 'date' && f.auto)
      .forEach((f) => setField(f.id, new Date().toISOString()));
  }, [schema, draft, draftFormId, resetDraft, runGps, setField]);

  const isDirty = useCallback(() => {
    if (!schema) return false;
    return schema.fields.some((f) => isFieldFilled(f, draft[f.id]));
  }, [schema, draft]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (savedFlash) return true;
      if (isDirty()) { setExitWarn(true); return true; }
      return false;
    });
    return () => handler.remove();
  }, [isDirty, savedFlash]);

  const requiredFields = useMemo(
    () => (schema?.fields.filter((f) => f.required) ?? []).filter((f) => isFieldVisible(f, draft)),
    [schema, draft],
  );
  const filledCount = useMemo(
    () => requiredFields.filter((f) => isFieldFilled(f, draft[f.id])).length,
    [requiredFields, draft],
  );
  const progress = useMemo(
    () => (requiredFields.length > 0 ? filledCount / requiredFields.length : 1),
    [requiredFields, filledCount],
  );

  const handleSave = useCallback(() => {
    if (!schema) return;
    if (savedFlash) return;

    const hasUnfilled = requiredFields.some((f) => !isFieldFilled(f, draft[f.id]));

    if (hasUnfilled) {
      setShowErrors(true);
      showSnack('Fill in all required fields');
      return;
    }

    const visibleIds = new Set(
      schema.fields.filter((f) => isFieldVisible(f, draft)).map((f) => f.id),
    );
    const filteredDraft = Object.fromEntries(
      Object.entries(draft).filter(([key]) => visibleIds.has(key)),
    );

    addEntry(filteredDraft, schema.fields, schema.formTitle);
    setSavedFlash(true);
    resetDraft();
    router.replace('/');
  }, [schema, savedFlash, requiredFields, draft, setShowErrors, showSnack, addEntry, resetDraft]);

  const pickImage = useCallback(async (source: 'camera' | 'library') => {
    setPhotoSheet(false);
    const imageFieldId = schema?.fields.find((f) => f.type === 'image')?.id;
    if (!imageFieldId) {
      showSnack('No photo field on this form');
      return;
    }
    try {
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        const id = `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const picked = new File(result.assets[0].uri);
        const dest = new File(Paths.document, `${id}.jpg`);
        picked.copy(dest);
        const newPhoto: PhotoItem = { id, uri: dest.uri };
        setField(imageFieldId, [...(draft[imageFieldId] ?? []), newPhoto]);
      }
    } catch {
      showSnack('Could not add photo');
    }
  }, [schema, showSnack, draft, setField]);

  const handleBack = useCallback(() => {
    if (isDirty()) setExitWarn(true);
    else router.back();
  }, [isDirty]);

  const handleFieldChange = useCallback((id: string, val: any) => setField(id, val), [setField]);

  if (!schema) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#171d1b" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>New entry</Text>
        </View>
        <View style={styles.noFormState}>
          <MaterialIcons name="file-present" size={56} color="#8EA8B8" />
          <Text style={styles.noFormTitle}>No form loaded</Text>
          <Text style={styles.noFormHint}>
            Go back and load a form before collecting entries.
          </Text>
          <TouchableOpacity style={styles.noFormBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={20} color="#fff" />
            <Text style={styles.noFormBtnText}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.inner, { paddingTop: insets.top }]}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleBack}>
            <MaterialIcons name="arrow-back" size={24} color="#171d1b" />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.screenTitle}>New entry</Text>
            <Text style={styles.formNameSub} numberOfLines={1}>{schema.formTitle}</Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        {/* Progress */}
        {requiredFields.length > 0 && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              {filledCount}/{requiredFields.length}
            </Text>
          </View>
        )}

        {/* Form */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <DynamicForm
            fields={schema.fields}
            sections={schema.sections}
            draft={draft}
            showErrors={showErrors}
            onFieldChange={handleFieldChange}
            onAddPhotoPress={() => setPhotoSheet(true)}
            gpsStatus={gpsStatus}
            onGpsCapture={runGps}
          />
        </ScrollView>

        {/* Save button */}
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.saveBtn, savedFlash && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={savedFlash}
          >
            <MaterialIcons name="check" size={22} color="#fff" />
            <Text style={styles.saveBtnText}>Save entry</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Toast
        message={savedFlash ? `Entry saved · ${schema.formTitle}` : null}
        onDismiss={() => setSavedFlash(false)}
        bottom={96 + insets.bottom}
        icon="check-circle"
      />

      {/* Photo sheet */}
      {photoSheet && (
        <Pressable style={styles.scrim} onPress={() => setPhotoSheet(false)} />
      )}
      {photoSheet && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add photo</Text>
          </View>
          {[
            { label: 'Take photo', icon: 'photo-camera' as const, source: 'camera' as const },
            { label: 'Choose from gallery', icon: 'image' as const, source: 'library' as const },
          ].map((item) => (
            <TouchableOpacity
              key={item.source}
              style={styles.sheetItem}
              onPress={() => pickImage(item.source)}
            >
              <View style={styles.sheetIconCircle}>
                <MaterialIcons name={item.icon} size={22} color="#2589C8" />
              </View>
              <Text style={styles.sheetItemText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Toast
        message={snackbar}
        onDismiss={() => setSnackbar(null)}
        bottom={96 + insets.bottom}
        icon="error-outline"
      />

      <Toast
        message={exitWarn ? 'Discard unsaved entry?' : null}
        onDismiss={() => setExitWarn(false)}
        bottom={96 + insets.bottom}
        icon="delete-outline"
        action={{ label: 'Discard', onPress: () => { setExitWarn(false); resetDraft(); router.back(); } }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7FBFE' },
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
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#171d1b',
  },
  formNameSub: {
    fontSize: 12,
    color: '#3f4946',
    marginTop: 1,
  },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#D8ECFA',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2589C8',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2589C8',
    minWidth: 28,
    textAlign: 'right',
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 110,
    gap: 20,
  },

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
    backgroundColor: '#2589C8',
    shadowColor: '#17689B',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  saveBtnDisabled: {
    backgroundColor: '#62B3E5',
    shadowOpacity: 0,
    elevation: 0,
  },


  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.42)',
    zIndex: 30,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 31,
    backgroundColor: '#F7FBFE',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    elevation: 16,
  },
  sheetHandle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#B8C9D4',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: { paddingHorizontal: 22, paddingBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: '#171d1b' },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginHorizontal: 8,
    borderRadius: 14,
  },
  sheetIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAF6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetItemText: { fontSize: 15, fontWeight: '500', color: '#171d1b' },


  noFormState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 12,
  },
  noFormTitle: { fontSize: 20, fontWeight: '600', color: '#171d1b', marginTop: 4 },
  noFormHint: { fontSize: 14, color: '#3f4946', textAlign: 'center', lineHeight: 21 },
  noFormBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#2589C8',
  },
  noFormBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
