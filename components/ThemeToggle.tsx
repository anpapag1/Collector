import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemeMode } from '../store/themeStore';

type ThemeToggleProps = {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
};

const TRACK_WIDTH = 132;
const THUMB_SIZE = 42;
const TRACK_PADDING = 5;
const TRAVEL = TRACK_WIDTH - THUMB_SIZE - TRACK_PADDING * 2;

export default function ThemeToggle({ mode, onChange }: ThemeToggleProps) {
  const progress = useRef(new Animated.Value(mode === 'dark' ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: mode === 'dark' ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 190,
      mass: 0.75,
    }).start();
  }, [mode, progress]);

  const isDark = mode === 'dark';

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.label,
          isDark ? styles.labelMutedDark : styles.labelActiveLight,
        ]}
      >
        Light
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Dark mode"
        accessibilityState={{ checked: isDark }}
        hitSlop={8}
        onPress={() => onChange(isDark ? 'light' : 'dark')}
        style={[styles.track, isDark ? styles.trackDark : styles.trackLight]}
      >
        <Animated.View
          style={[
            styles.thumb,
            isDark ? styles.thumbDark : styles.thumbLight,
            { transform: [{ translateX: Animated.multiply(progress, TRAVEL) }] },
          ]}
        >
          <MaterialIcons
            name={isDark ? 'dark-mode' : 'light-mode'}
            size={23}
            color="#FFFFFF"
          />
        </Animated.View>
      </Pressable>
      <Text
        style={[
          styles.label,
          isDark ? styles.labelActiveDark : styles.labelMutedLight,
        ]}
      >
        Dark
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  label: {
    minWidth: 34,
    fontSize: 14,
    fontWeight: '600',
  },
  labelActiveLight: {
    color: '#171D1B',
  },
  labelMutedLight: {
    color: '#7A8B95',
  },
  labelActiveDark: {
    color: '#F7FBFE',
  },
  labelMutedDark: {
    color: '#738995',
  },
  track: {
    width: TRACK_WIDTH,
    height: 52,
    borderRadius: 26,
    padding: TRACK_PADDING,
    justifyContent: 'center',
  },
  trackLight: {
    backgroundColor: '#FBE9AB',
  },
  trackDark: {
    backgroundColor: '#10394C',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  thumbLight: {
    backgroundColor: '#F9C432',
  },
  thumbDark: {
    backgroundColor: '#29ACE8',
  },
});
