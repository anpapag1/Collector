import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import React, { memo, useEffect, useRef } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { GpsStatus } from '../../store/formStore';
import { POOR_ACCURACY_THRESHOLD_M } from '../../utils/sensors';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

type Props = {
  status: GpsStatus;
  coords?: string;
  accuracy?: string;
  address?: string | null;
  onCapture: () => void;
  error?: boolean;
};

function GpsField({ status, coords, accuracy, address, onCapture, error }: Props) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
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

  // DynamicForm passes accuracy as a formatted string like "±5.0 m". Parse the
  // numeric value back out so we can flag a low-accuracy fix. The warning is
  // non-blocking — the user can keep the fix or tap Redo.
  const accuracyMeters = accuracy ? parseFloat(accuracy.replace(/[^0-9.]/g, '')) : NaN;
  const lowAccuracy = Number.isFinite(accuracyMeters) && accuracyMeters > POOR_ACCURACY_THRESHOLD_M;

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
            <MaterialIcons name="location-on" size={22} color={colors.brand.primary} />
          </View>
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: colors.text.brandDark }]}>Location captured</Text>
            {address ? <Text style={styles.address}>{address}</Text> : null}
            <Text style={styles.sub}>{coords} · {accuracy}</Text>
            {lowAccuracy && (
              <Text style={styles.warnText}>
                Low accuracy (±{Math.round(accuracyMeters)}m) — move to open sky and Redo
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onCapture} style={styles.redoBtn}>
            <Text style={styles.redoBtnText}>Redo</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'idle' && (
        <View style={styles.row}>
          <MaterialIcons name="location-searching" size={24} color={colors.text.secondary} />
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

const createStyles = (colors: AppColors) => StyleSheet.create({
  banner: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.soft,
  },
  bannerError: {
    borderColor: colors.text.danger,
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
    borderColor: colors.border.success,
    borderTopColor: colors.brand.primary,
  },
  doneCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.elevatedGreen,
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
    color: colors.text.primary,
  },
  sub: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 1,
  },
  address: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.primary,
    marginTop: 1,
  },
  required: {
    color: colors.text.danger,
  },
  redoBtn: {
    padding: 6,
  },
  redoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand.primary,
  },
  captureBtn: {
    backgroundColor: colors.action.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  captureBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.inverse,
  },
  errorText: {
    fontSize: 12,
    color: colors.text.danger,
    marginTop: 8,
  },
  warnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.warning,
    marginTop: 3,
  },
});

export default memo(GpsField);
