import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useOnboardingStore } from '../store/onboardingStore';
import { useAuthStore } from '../store/authStore';
import { useAppColors } from '../theme/useAppColors';
import { AppColors } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_DISTANCE = SCREEN_WIDTH * 0.55;

const STEP_COLORS = ['#2589C8', '#2ca878', '#7867d7', '#d89c31', '#0d75b1', '#3aa0a0'];

const STEPS = [
  {
    title: 'Welcome to Collector!',
    description: 'Your field data collection companion.\nCollect · Review · Export',
  },
  {
    title: 'Your Dashboard',
    description: 'See your active form, latest entries with photos & GPS, and visualise all recorded points on an interactive map.',
  },
  {
    title: 'Build Custom Forms',
    description: 'Create forms with text fields, numbers, date pickers, star ratings, photo capture, and automatic GPS recording.',
  },
  {
    title: 'Record Entries in the Field',
    description: 'Tap + New Entry to start capturing data. GPS coordinates and photos are attached automatically.',
  },
  {
    title: 'Export Your Data',
    description: 'Download your collected data as a CSV for Excel, or as a ZIP archive with all attached photos.',
  },
  {
    title: 'Web Platform',
    description: 'Review, filter, edit, and manage everything from the web — always in sync with your mobile data.',
  },
];

const TOTAL = STEPS.length;

// ── Illustrations ─────────────────────────────────────────────────────────────

function IllustrationWelcome({ color }: { color: string }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeRing = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(1000 - delay),
        ])
      );
    const a1 = makeRing(ring1, 0);
    const a2 = makeRing(ring2, 500);
    a1.start();
    a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, []);

  const ringStyle = (val: Animated.Value) => ({
    opacity: val.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] }),
    transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
  });

  return (
    <View style={ilStyles.container}>
      <Animated.View style={[ilStyles.ring, { borderColor: color }, ringStyle(ring1)]} />
      <Animated.View style={[ilStyles.ring, { borderColor: color }, ringStyle(ring2)]} />
      <View style={[ilStyles.centerCircle, { backgroundColor: color }]}>
        <MaterialIcons name="apps" size={32} color="#fff" />
      </View>
    </View>
  );
}

function IllustrationDashboard({ color }: { color: string }) {
  const cards = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.stagger(220, cards.map(v =>
          Animated.spring(v, { toValue: 1, damping: 18, stiffness: 200, useNativeDriver: true })
        )),
        Animated.delay(1200),
        Animated.parallel(cards.map(v =>
          Animated.timing(v, { toValue: 0, duration: 250, useNativeDriver: true })
        )),
        Animated.delay(300),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const ICONS: React.ComponentProps<typeof MaterialIcons>['name'][] = ['photo', 'location-on', 'star'];
  const WIDTHS = [[60, 38], [72, 44], [52, 32]];

  return (
    <View style={ilStyles.container}>
      {cards.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            ilStyles.miniCard,
            { borderLeftColor: color },
            {
              opacity: v,
              transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            },
          ]}
        >
          <View style={[ilStyles.miniCardDot, { backgroundColor: color }]} />
          <View style={ilStyles.miniCardLines}>
            <View style={[ilStyles.miniLine, { width: WIDTHS[i][0] }]} />
            <View style={[ilStyles.miniLine, { width: WIDTHS[i][1], opacity: 0.45 }]} />
          </View>
          <MaterialIcons name={ICONS[i]} size={14} color={color} />
        </Animated.View>
      ))}
    </View>
  );
}

function IllustrationFormBuilder({ color }: { color: string }) {
  const fields = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  const cursor = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursor, { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.timing(cursor, { toValue: 1, duration: 380, useNativeDriver: true }),
      ])
    );
    blink.start();

    const slide = Animated.loop(
      Animated.sequence([
        Animated.stagger(280, fields.map(v =>
          Animated.timing(v, { toValue: 1, duration: 300, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true })
        )),
        Animated.delay(1000),
        Animated.parallel(fields.map(v =>
          Animated.timing(v, { toValue: 0, duration: 200, useNativeDriver: true })
        )),
        Animated.delay(350),
      ])
    );
    slide.start();
    return () => { blink.stop(); slide.stop(); };
  }, []);

  const LABELS = ['Name', 'Date', 'Photo'];
  const ICONS: React.ComponentProps<typeof MaterialIcons>['name'][] = ['text-fields', 'event', 'camera-alt'];

  return (
    <View style={ilStyles.container}>
      {fields.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            ilStyles.formField,
            {
              opacity: v,
              transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
            },
          ]}
        >
          <MaterialIcons name={ICONS[i]} size={14} color={color} style={{ marginRight: 6 }} />
          <Text style={ilStyles.fieldLabel}>{LABELS[i]}</Text>
          {i === 1 && (
            <Animated.View style={[ilStyles.cursor, { opacity: cursor, backgroundColor: color }]} />
          )}
        </Animated.View>
      ))}
    </View>
  );
}

function IllustrationNewEntry({ color }: { color: string }) {
  const pinY = useRef(new Animated.Value(-32)).current;
  const pinScale = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pinY, { toValue: 0, duration: 480, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(pinScale, { toValue: 0.82, duration: 90, useNativeDriver: true }),
          Animated.spring(pinScale, { toValue: 1, damping: 10, stiffness: 260, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(ringOpacity, { toValue: 0.55, duration: 80, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0, duration: 620, useNativeDriver: true }),
          ]),
        ]),
        Animated.delay(500),
        Animated.parallel([
          Animated.timing(pinY, { toValue: -32, duration: 0, useNativeDriver: true }),
          Animated.timing(ringScale, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(300),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={ilStyles.container}>
      <View style={ilStyles.mapBg}>
        {[0, 1, 2].map(i => <View key={i} style={ilStyles.mapLine} />)}
      </View>
      <Animated.View style={[
        ilStyles.locationRing,
        { borderColor: color, opacity: ringOpacity, transform: [{ scale: ringScale }] },
      ]} />
      <Animated.View style={{ transform: [{ translateY: pinY }, { scale: pinScale }] }}>
        <MaterialIcons name="location-on" size={38} color={color} />
      </Animated.View>
    </View>
  );
}

function IllustrationExport({ color }: { color: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.parallel([
          Animated.spring(checkScale, { toValue: 1, damping: 14, stiffness: 220, useNativeDriver: true }),
          Animated.timing(checkOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]),
        Animated.delay(800),
        Animated.parallel([
          Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: false }),
          Animated.timing(checkOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
          Animated.timing(checkScale, { toValue: 0.3, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(400),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={ilStyles.container}>
      <View style={ilStyles.exportBox}>
        <MaterialIcons name="insert-drive-file" size={18} color={color} style={{ marginBottom: 6 }} />
        <Text style={ilStyles.exportLabel}>entries.csv</Text>
        <View style={ilStyles.progressTrack}>
          <Animated.View
            style={[
              ilStyles.progressBar,
              {
                backgroundColor: color,
                width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        </View>
        <Animated.View style={{ opacity: checkOpacity, transform: [{ scale: checkScale }], marginTop: 8 }}>
          <MaterialIcons name="check-circle" size={26} color={color} />
        </Animated.View>
      </View>
    </View>
  );
}

function IllustrationWeb({ color }: { color: string }) {
  const dotX = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const travel = Animated.loop(
      Animated.sequence([
        // phone → web
        Animated.timing(dotOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(dotX, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.delay(250),
        // web → phone
        Animated.timing(dotX, { toValue: 2, duration: 0, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(dotX, { toValue: 3, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.delay(250),
        Animated.timing(dotX, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    travel.start();
    return () => travel.stop();
  }, []);

  const translateX = dotX.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [-46, 46, 46, -46],
  });

  return (
    <View style={ilStyles.container}>
      <View style={ilStyles.syncRow}>
        <View style={[ilStyles.deviceBox, { borderColor: color }]}>
          <MaterialIcons name="smartphone" size={22} color={color} />
        </View>
        <View style={ilStyles.syncTrack}>
          <View style={[ilStyles.syncDash, { borderColor: color }]} />
          <Animated.View
            style={[
              ilStyles.syncDot,
              { backgroundColor: color, opacity: dotOpacity, transform: [{ translateX }] },
            ]}
          />
        </View>
        <View style={[ilStyles.deviceBox, { borderColor: color }]}>
          <MaterialIcons name="computer" size={22} color={color} />
        </View>
      </View>
      <Text style={[ilStyles.syncLabel, { color }]}>Always in sync</Text>
    </View>
  );
}

const ILLUSTRATIONS = [
  IllustrationWelcome,
  IllustrationDashboard,
  IllustrationFormBuilder,
  IllustrationNewEntry,
  IllustrationExport,
  IllustrationWeb,
];

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function OnboardingModal() {
  const { hasSeenOnboarding, currentStep, setHasSeenOnboarding, nextStep, manuallyOpened } = useOnboardingStore();
  const session = useAuthStore((s) => s.session);
  const colors = useAppColors();

  // Auto-start after first sign-in; manual "App Tour" always works.
  const visible = manuallyOpened || (!!session && !hasSeenOnboarding);
  const isLast = currentStep === TOTAL - 1;

  const scaleAnim   = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const slideAnim   = useRef(new Animated.Value(0)).current;
  const dotAnims    = useRef(STEPS.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  // Reset all animation state whenever the modal opens
  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      slideAnim.setValue(0);
      dotAnims.forEach((d, i) => d.setValue(i === 0 ? 1 : 0));
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, damping: 22, stiffness: 260, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const animateDots = (toStep: number) => {
    STEPS.forEach((_, i) => {
      Animated.timing(dotAnims[i], {
        toValue: i === toStep ? 1 : 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    });
  };

  const goNext = () => {
    if (isLast) {
      setHasSeenOnboarding();
      return;
    }
    const nextIndex = currentStep + 1;
    Animated.timing(slideAnim, {
      toValue: -1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      nextStep();
      slideAnim.setValue(1);
      animateDots(nextIndex);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  };

  if (!visible) return null;

  const step = STEPS[currentStep];
  const color = STEP_COLORS[currentStep];
  const Illustration = ILLUSTRATIONS[currentStep];

  const slideTranslateX = slideAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-SLIDE_DISTANCE, 0, SLIDE_DISTANCE],
  });

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.background.white,
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Decorative background bubbles */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[styles.bubbleLarge, { backgroundColor: color + '18' }]} />
            <View style={[styles.bubbleSmall, { backgroundColor: colors.background.muted }]} />
          </View>

          {/* Skip */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={setHasSeenOnboarding}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 4 }}
          >
            <Text style={[styles.skipText, { color: colors.text.secondary }]}>Skip</Text>
          </TouchableOpacity>

          {/* Animated step content — key forces remount of illustration on step change */}
          <Animated.View
            style={[styles.content, { transform: [{ translateX: slideTranslateX }] }]}
          >
            <Illustration key={currentStep} color={color} />

            <Text style={[styles.title, { color: colors.text.primary }]}>
              {step.title}
            </Text>
            <Text style={[styles.description, { color: colors.text.secondary }]}>
              {step.description}
            </Text>
          </Animated.View>

          {/* Dot pagination */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => {
              const dotWidth = dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [8, 22] });
              const dotOpacity = dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
              return (
                <Animated.View
                  key={i}
                  style={[
                    styles.dot,
                    { width: dotWidth, opacity: dotOpacity, backgroundColor: color },
                  ]}
                />
              );
            })}
          </View>

          {/* CTA button */}
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: color }]}
            onPress={goNext}
            activeOpacity={0.82}
          >
            <Text style={styles.nextText}>{isLast ? 'Get Started ✓' : 'Next →'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  bubbleLarge: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    right: -72,
    top: -72,
  },
  bubbleSmall: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    left: -36,
    bottom: -36,
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    marginBottom: 8,
  },
  skipText: {
    fontSize: 14,
    fontFamily: 'Roboto_500Medium',
  },
  content: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
    minHeight: 280,
    justifyContent: 'center',
  },
  title: {
    fontSize: 21,
    fontFamily: 'Roboto_700Bold',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 28,
    marginTop: 18,
  },
  description: {
    fontSize: 14.5,
    fontFamily: 'Roboto_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 26,
    marginBottom: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  nextText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    letterSpacing: 0.3,
  },
});

// ── Illustration styles ───────────────────────────────────────────────────────

const ilStyles = StyleSheet.create({
  container: {
    width: '100%',
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Welcome — sonar rings
  ring: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
  },
  centerCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dashboard — mini entry cards
  miniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 200,
    backgroundColor: '#f4f8fb',
    borderRadius: 8,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 3,
    gap: 8,
  },
  miniCardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  miniCardLines: {
    flex: 1,
    gap: 4,
  },
  miniLine: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#c8d8e4',
  },
  // Form builder — field rows
  formField: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 190,
    backgroundColor: '#f4f8fb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginVertical: 3,
    borderWidth: 1,
    borderColor: '#dde8ef',
  },
  fieldLabel: {
    fontSize: 12,
    color: '#4a6070',
    fontFamily: 'Roboto_500Medium',
    flex: 1,
  },
  cursor: {
    width: 1.5,
    height: 13,
    borderRadius: 1,
    marginLeft: 2,
  },
  // New entry — map + pin
  mapBg: {
    position: 'absolute',
    width: 180,
    height: 100,
    borderRadius: 10,
    backgroundColor: '#e8f3fb',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
    overflow: 'hidden',
  },
  mapLine: {
    height: 1,
    backgroundColor: '#c5daea',
    width: '100%',
  },
  locationRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
  },
  // Export — progress box
  exportBox: {
    width: 180,
    backgroundColor: '#f4f8fb',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dde8ef',
  },
  exportLabel: {
    fontSize: 12,
    color: '#4a6070',
    fontFamily: 'Roboto_500Medium',
    marginBottom: 8,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dde8ef',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  // Web sync
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  deviceBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f8fb',
  },
  syncTrack: {
    width: 100,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncDash: {
    position: 'absolute',
    width: '80%',
    height: 1.5,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
  },
  syncDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: 'absolute',
  },
  syncLabel: {
    fontSize: 11,
    fontFamily: 'Roboto_500Medium',
    marginTop: 10,
    letterSpacing: 0.3,
  },
});
