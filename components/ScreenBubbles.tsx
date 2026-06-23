import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function ScreenBubbles() {
  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={[styles.bubble, styles.bubbleLarge]} />
      <View style={[styles.bubble, styles.bubbleMedium]} />
      <View style={[styles.bubble, styles.bubbleSmall]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    backgroundColor: colors.brand.primarySoft,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  bubbleLarge: {
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -86,
    top: -62,
  },
  bubbleMedium: {
    width: 138,
    height: 138,
    borderRadius: 69,
    left: -52,
    top: 148,
    backgroundColor: colors.background.soft,
  },
  bubbleSmall: {
    width: 96,
    height: 96,
    borderRadius: 48,
    right: 26,
    bottom: 88,
    backgroundColor: colors.background.muted,
  },
});
