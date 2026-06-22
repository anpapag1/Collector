import { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type Props = {
  message: string | null;
  onDismiss: () => void;
  bottom?: number;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  action?: { label: string; onPress: () => void };
};

export default function Toast({ message, onDismiss, bottom = 32, icon = 'check-circle', action }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const animation = message
      ? Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
        ])
      : Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 6, duration: 150, useNativeDriver: true }),
        ]);
    animation.start();
    return () => animation.stop();
  }, [message]);

  if (!message) return null;

  return (
    <Animated.View
      style={[styles.wrap, { bottom, opacity, transform: [{ translateY }] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <TouchableOpacity style={styles.pill} onPress={onDismiss} activeOpacity={0.75}>
        <MaterialIcons name={icon} size={15} color="rgba(131,213,198,0.9)" />
        <Text style={styles.text} numberOfLines={2}>{message}</Text>
        {action ? (
          <TouchableOpacity onPress={action.onPress} hitSlop={8}>
            <Text style={styles.actionText}>{action.label}</Text>
          </TouchableOpacity>
        ) : (
          <MaterialIcons name="close" size={14} color="rgba(255,255,255,0.45)" />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(23,29,27,0.82)',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 100,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(238,241,238,0.95)',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#83d5c6',
  },
});
