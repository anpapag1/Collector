import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntriesStore } from '../store/entriesStore';
import { useFormStore } from '../store/formStore';
import { buildAndExport, exportFilename } from '../utils/exporter';

type Phase = 'summary' | 'building' | 'done';

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const entries = useEntriesStore((s) => s.entries);
  const schema = useFormStore((s) => s.schema);

  const [phase, setPhase] = useState<Phase>('summary');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const imageFieldId = schema?.fields.find((f) => f.type === 'image')?.id;
  const photoTotal = entries.reduce((sum, e) => {
    const fieldId = (e.fields?.find((f) => f.type === 'image')?.id) ?? imageFieldId;
    if (!fieldId) return sum;
    return sum + ((e.data[fieldId] ?? []) as any[]).length;
  }, 0);
  const filename = schema ? exportFilename(schema.formId) : 'export.zip';

  useEffect(() => {
    if (phase === 'building') {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [phase]);

  const animateTo = (pct: number) => {
    setProgress(pct);
    Animated.timing(progressAnim, {
      toValue: pct / 100,
      duration: 120,
      useNativeDriver: false,
    }).start();
  };

  const handleBuild = async () => {
    if (!schema) return;
    setPhase('building');
    setError(null);
    animateTo(0);

    try {
      const { path: zipPath, skippedPhotos } = await buildAndExport(entries, schema, (pct) =>
        animateTo(pct)
      );
      setPhase('done');
      if (skippedPhotos > 0) {
        setError(
          `${skippedPhotos} photo${skippedPhotos === 1 ? '' : 's'} could not be read and were skipped from the export.`
        );
      }
      await Sharing.shareAsync(zipPath, {
        mimeType: 'application/zip',
        dialogTitle: 'Share export',
      });
      // Sharing.shareAsync resolves even if the user cancels the share sheet,
      // so we can't reliably tell success from cancellation here. Stay on
      // this screen and let the user navigate back themselves rather than
      // risk redirecting home when nothing was actually shared.
      setPhase('summary');
    } catch (e: any) {
      setError(e?.message ?? 'Export failed');
      setPhase('summary');
    }
  };

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#171d1b" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Export data</Text>
      </View>

      <View style={styles.body}>
        {/* ── Summary phase ── */}
        {(phase === 'summary') && (
          <>
            {error && (
              <View style={styles.errorBox}>
                <MaterialIcons name="error-outline" size={18} color="#ba1a1a" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="folder-zip" size={26} color="#006a60" />
                <View>
                  <Text style={styles.cardHeaderTitle}>Ready to export</Text>
                  <Text style={styles.cardHeaderSub}>Bundle as a single ZIP archive</Text>
                </View>
              </View>

              {[
                { label: 'Form', value: schema?.formTitle ?? '—' },
                { label: 'Entries', value: String(entries.length) },
                { label: 'Photos', value: String(photoTotal) },
                { label: 'Format', value: 'ZIP · entries.json + /images' },
              ].map((row, i, arr) => (
                <View
                  key={row.label}
                  style={[styles.cardRow, i < arr.length - 1 && styles.cardRowBorder]}
                >
                  <Text style={styles.cardRowLabel}>{row.label}</Text>
                  <Text style={styles.cardRowValue} numberOfLines={2}>{row.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={20} color="#3f4946" />
              <Text style={styles.infoText}>
                Output file:{' '}
                <Text style={styles.infoMono}>{filename}</Text>
                {'\n'}The Android share sheet opens when the archive is built.
              </Text>
            </View>
          </>
        )}

        {/* ── Building phase ── */}
        {phase === 'building' && (
          <View style={styles.buildingCenter}>
            <View style={styles.spinnerWrap}>
              <Animated.View
                style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}
              />
              <MaterialIcons
                name="folder-zip"
                size={34}
                color="#006a60"
                style={styles.spinnerIcon}
              />
            </View>
            <Text style={styles.buildingTitle}>Building archive…</Text>
            <Text style={styles.buildingFilename}>{filename}</Text>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressLabel}>{progress}%</Text>
          </View>
        )}
      </View>

      {/* ── Build & export button ── */}
      {phase === 'summary' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.buildBtn}
            onPress={handleBuild}
            activeOpacity={0.85}
            disabled={entries.length === 0}
          >
            <MaterialIcons name="bolt" size={22} color="#fff" />
            <Text style={styles.buildBtnText}>
              {entries.length === 0 ? 'No entries to export' : 'Build & export'}
            </Text>
          </TouchableOpacity>
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

  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffdad6',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { fontSize: 13, color: '#ba1a1a', flex: 1 },

  // Stats card
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2ebe7',
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    backgroundColor: '#eef5f1',
    borderBottomWidth: 1,
    borderBottomColor: '#e2ebe7',
  },
  cardHeaderTitle: { fontSize: 15, fontWeight: '600', color: '#171d1b' },
  cardHeaderSub: { fontSize: 12, color: '#3f4946', marginTop: 1 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  cardRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f0',
  },
  cardRowLabel: { fontSize: 13, color: '#3f4946' },
  cardRowValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#171d1b',
    textAlign: 'right',
    maxWidth: '62%',
  },

  // Info box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#eef5f1',
    borderRadius: 14,
    padding: 14,
  },
  infoText: { fontSize: 12.5, lineHeight: 19, color: '#3f4946', flex: 1 },
  infoMono: { fontFamily: 'monospace', color: '#171d1b' },

  // Building
  buildingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    paddingBottom: 30,
  },
  spinnerWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 6,
    borderColor: '#cfe5df',
    borderTopColor: '#006a60',
  },
  spinnerIcon: {
    position: 'absolute',
  },
  buildingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#171d1b',
    marginTop: 22,
  },
  buildingFilename: {
    fontSize: 13,
    color: '#3f4946',
    marginTop: 4,
  },
  progressTrack: {
    width: 300,
    height: 8,
    backgroundColor: '#cfe5df',
    borderRadius: 100,
    marginTop: 22,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#006a60',
    borderRadius: 100,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#006a60',
    marginTop: 8,
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  buildBtn: {
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
  buildBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
