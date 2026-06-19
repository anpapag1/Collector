import { useState, useEffect, useRef, useCallback } from 'react';
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
import { useFormStore } from '../store/formStore';
import { useEntriesStore } from '../store/entriesStore';
import { captureLocation } from '../utils/sensors';
import { PhotoItem } from '../types';
import GpsField from '../components/fields/GpsField';
import DynamicForm from '../components/DynamicForm';

export default function CollectScreen() {
  const insets = useSafeAreaInsets();
  const schema = useFormStore((s) => s.schema);
  const { draft, gpsStatus, setField, setGpsStatus, resetDraft, showErrors, setShowErrors } =
    useFormStore();
  const addEntry = useEntriesStore((s) => s.addEntry);

  const [savedFlash, setSavedFlash] = useState(false);
  const [exitWarn, setExitWarn] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnack = useCallback((msg: string) => {
    setSnackbar(msg);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar(null), 2600);
  }, []);

  // Reset draft on mount and start GPS if auto
  useEffect(() => {
    resetDraft();
    const gpsField = schema?.fields.find((f) => f.type === 'gps');
    if (gpsField?.auto) {
      runGps();
    }
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Android hardware back button
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (savedFlash) return true;
      if (isDirty()) {
        setExitWarn(true);
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [draft, savedFlash]);

  const isDirty = useCallback(() => {
    return (
      !!draft.site_name ||
      !!draft.category ||
      (draft.rating ?? 0) > 0 ||
      !!draft.notes ||
      (draft.photo ?? []).length > 0
    );
  }, [draft]);

  const runGps = async () => {
    setGpsStatus('capturing');
    try {
      const loc = await captureLocation();
      setField('location', loc);
      setGpsStatus('done');
    } catch {
      setGpsStatus('idle');
    }
  };

  // Progress bar: count of filled required fields
  const requiredFields = schema?.fields.filter((f) => f.required) ?? [];
  const filledCount = requiredFields.filter((f) => {
    const v = draft[f.id];
    if (f.type === 'gps') return !!v;
    if (f.type === 'rating') return (v ?? 0) > 0;
    return !!v && String(v).trim().length > 0;
  }).length;
  const progress = requiredFields.length > 0 ? filledCount / requiredFields.length : 0;

  const location = draft.location;
  const coordsStr = location
    ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
    : '';
  const accStr = location ? `±${location.accuracy.toFixed(1)} m` : '';

  const handleSave = () => {
    const valid =
      draft.site_name?.trim() &&
      draft.category &&
      (draft.rating ?? 0) > 0 &&
      draft.location;

    if (!valid) {
      setShowErrors(true);
      showSnack('Fill in all required fields');
      return;
    }

    addEntry({ ...draft, site_name: draft.site_name.trim() });
    setSavedFlash(true);
    saveTimer.current = setTimeout(() => {
      setSavedFlash(false);
      resetDraft();
      router.replace('/');
    }, 1050);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    setPhotoSheet(false);
    try {
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });

      if (!result.canceled && result.assets[0]) {
        const newPhoto: PhotoItem = {
          id: `photo-${Date.now()}`,
          uri: result.assets[0].uri,
        };
        setField('photo', [...(draft.photo ?? []), newPhoto]);
      }
    } catch {}
  };

  const handleBack = () => {
    if (isDirty()) {
      setExitWarn(true);
    } else {
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.inner, { paddingTop: insets.top }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <MaterialIcons name="arrow-back" size={24} color="#171d1b" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>New entry</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        {/* Scrollable form */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* GPS banner */}
          <GpsField
            status={gpsStatus}
            coords={coordsStr}
            accuracy={accStr}
            onCapture={runGps}
            error={showErrors && !location}
          />

          {/* Dynamic fields */}
          {schema && (
            <DynamicForm
              fields={schema.fields}
              draft={draft}
              showErrors={showErrors}
              onFieldChange={(id, val) => setField(id, val)}
              onAddPhotoPress={() => setPhotoSheet(true)}
            />
          )}
        </ScrollView>

        {/* Sticky save button */}
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <MaterialIcons name="save" size={22} color="#fff" />
            <Text style={styles.saveBtnText}>Save entry</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Success overlay */}
      {savedFlash && (
        <View style={styles.successOverlay}>
          <View style={styles.successCircle}>
            <MaterialIcons name="check" size={54} color="#006a60" />
          </View>
          <Text style={styles.successText}>Entry saved</Text>
        </View>
      )}

      {/* Photo source sheet scrim */}
      {photoSheet && (
        <Pressable style={styles.scrim} onPress={() => setPhotoSheet(false)} />
      )}

      {/* Photo source sheet */}
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
                <MaterialIcons name={item.icon} size={22} color="#006a60" />
              </View>
              <Text style={styles.sheetItemText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Snackbar */}
      {snackbar && (
        <View style={[styles.snackbar, { bottom: 96 + insets.bottom }]}>
          <MaterialIcons name="error-outline" size={20} color="#ffb4ab" />
          <Text style={styles.snackText}>{snackbar}</Text>
        </View>
      )}

      {/* Exit dialog */}
      {exitWarn && (
        <View style={styles.dialogOverlay}>
          <View style={styles.dialog}>
            <MaterialIcons name="edit" size={26} color="#006a60" />
            <Text style={styles.dialogTitle}>Discard entry?</Text>
            <Text style={styles.dialogBody}>
              You have unsaved changes. Leaving now will discard this entry.
            </Text>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogBtn} onPress={() => setExitWarn(false)}>
                <Text style={styles.dialogBtnKeep}>Keep editing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogBtn}
                onPress={() => {
                  setExitWarn(false);
                  resetDraft();
                  router.back();
                }}
              >
                <Text style={styles.dialogBtnDiscard}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4fbf8' },
  inner: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtn: {
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
  },

  progressTrack: {
    height: 4,
    backgroundColor: '#cfe5df',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#006a60',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },

  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 104,
    gap: 20,
  },

  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#006a60',
    shadowColor: '#004840',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    backgroundColor: 'rgba(244,251,248,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#cce8e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#171d1b',
  },

  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
    zIndex: 30,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 31,
    backgroundColor: '#f4fbf8',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    elevation: 16,
  },
  sheetHandle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#c2cfca',
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
    backgroundColor: '#cce8e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetItemText: { fontSize: 15, fontWeight: '500', color: '#171d1b' },

  dialogOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 33,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  dialog: {
    backgroundColor: '#eef5f1',
    borderRadius: 28,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#171d1b',
    marginTop: 14,
  },
  dialogBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#3f4946',
    marginTop: 10,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 22,
  },
  dialogBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100 },
  dialogBtnKeep: { fontSize: 14, fontWeight: '600', color: '#006a60' },
  dialogBtnDiscard: { fontSize: 14, fontWeight: '600', color: '#ba1a1a' },

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
