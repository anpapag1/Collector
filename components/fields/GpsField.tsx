import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { memo, useEffect, useRef } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { GpsStatus } from '../../store/formStore';

type Props = {
  status: GpsStatus;
  coords?: string;
  accuracy?: string;
  onCapture: () => void;
  error?: boolean;
};

function GpsField({ status, coords, accuracy, onCapture, error }: Props) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'capturing') {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [status]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.banner, error && styles.bannerError]}>
      {status === 'capturing' && (
        <View style={styles.row}>
          <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />
          <View style={styles.textBlock}>
            <Text style={styles.title}>Capturing GPS location…</Text>
            <Text style={styles.sub}>Acquiring satellites</Text>
          </View>
        </View>
      )}

      {status === 'done' && (
        <View style={styles.row}>
          <View style={styles.doneCircle}>
            <MaterialIcons name="location-on" size={22} color="#2589C8" />
          </View>
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: '#17689B' }]}>Location captured</Text>
            <Text style={styles.sub}>{coords} · {accuracy}</Text>
          </View>
          <TouchableOpacity onPress={onCapture} style={styles.redoBtn}>
            <Text style={styles.redoBtnText}>Redo</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'idle' && (
        <View style={styles.row}>
          <MaterialIcons name="location-searching" size={24} color="#3f4946" />
          <View style={styles.textBlock}>
            <Text style={styles.title}>
              GPS location <Text style={styles.required}>*</Text>
            </Text>
            <Text style={styles.sub}>Not captured yet</Text>
          </View>
          <TouchableOpacity style={styles.captureBtn} onPress={onCapture}>
            <Text style={styles.captureBtnText}>Capture</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <Text style={styles.errorText}>GPS location is required</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D2E4EF',
    backgroundColor: '#F1F8FD',
  },
  bannerError: {
    borderColor: '#ba1a1a',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  spinner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#B7DBF3',
    borderTopColor: '#2589C8',
  },
  doneCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EAF6FD',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#171d1b',
  },
  sub: {
    fontSize: 12,
    color: '#3f4946',
    marginTop: 1,
  },
  required: {
    color: '#ba1a1a',
  },
  redoBtn: {
    padding: 6,
  },
  redoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2589C8',
  },
  captureBtn: {
    backgroundColor: '#2589C8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  captureBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  errorText: {
    fontSize: 12,
    color: '#ba1a1a',
    marginTop: 8,
  },
});

export default memo(GpsField);
