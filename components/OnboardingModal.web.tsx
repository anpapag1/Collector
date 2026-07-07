import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Animated, Easing, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useOnboardingStore } from '../store/onboardingStore';
import { useAuthStore } from '../store/authStore';
import { useAdminStore } from '../store/adminStore';
import { useAppColors } from '../theme/useAppColors';

const STEP_COLORS = ['#2589C8', '#2ca878', '#7867d7', '#d89c31', '#0d75b1', '#3aa0a0'];

// Matches Collector-Web's obSlideIn/obCardIn/obIconBounce overshoot curve
// (cubic-bezier(0.34, 1.56, 0.64, 1)).
const OVERSHOOT = Easing.bezier(0.34, 1.56, 0.64, 1);
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

const ALL_STEPS: { title: string; description: string; adminOnly?: boolean }[] = [
  {
    title: 'Welcome to Collector Web',
    description: 'Your management hub — everything collected from the mobile app appears here automatically, always in sync.',
  },
  {
    title: 'Your Forms Dashboard',
    description: 'Every form is a card with its field and entry counts. Click through to browse the entries it has collected.',
  },
  {
    title: 'Review & Filter Entries',
    description: 'Search across every field, open an entry to see its photos and GPS, or jump straight to it on the map.',
  },
  {
    title: 'Build Forms & Templates',
    description: 'The Form Builder creates new questionnaires from scratch or from a ready-made template.',
  },
  {
    title: 'Export Your Data',
    description: 'Download entries as CSV or Excel with embedded photos, or a ZIP archive with all photos attached.',
  },
  {
    title: 'Manage Users & Access',
    description: "Filter by any user to review their data, transfer a form's ownership between accounts, or edit an entry's data directly when needed.",
    adminOnly: true,
  },
];

// ── Looping-animation helper ────────────────────────────────────────────────
// A naive "stagger + repeat" loop (Animated.loop(Animated.sequence([delay(i*x), ...])))
// bakes the one-time stagger *inside* the repeating body, so items whose bodies
// don't all sum to the same total duration slowly drift apart after the first
// lap. This starts each item's loop — whose body is identical across items —
// after a one-time setTimeout offset instead, so relative phase never drifts.
function startStaggeredLoop(loop: Animated.CompositeAnimation, offsetMs: number) {
  const id = setTimeout(() => loop.start(), offsetMs);
  return () => {
    clearTimeout(id);
    loop.stop();
  };
}

// ── Illustrations ─────────────────────────────────────────────────────────────
// Reimplements Collector-Web's per-step .ili-* illustrations (dashboard.css /
// dashboard.html) with RN Animated loops instead of CSS keyframes, and the
// "Forms Dashboard" / "Review & Filter" steps mirror this app's own real
// form-card (app/index.web.tsx) and EntryCard.tsx layouts rather than
// abstract placeholder shapes.

function IllustrationSync({ color }: { color: string }) {
  const gpsPing = useRef(new Animated.Value(0)).current;
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const rows = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const gps = Animated.loop(
      Animated.sequence([
        Animated.timing(gpsPing, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(gpsPing, { toValue: 0, duration: 1100, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    );
    gps.start();

    const DOT_CYCLE = 2400;
    const dotCleanups = dots.map((v, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(DOT_CYCLE - 1400),
        ])
      );
      return startStaggeredLoop(loop, i * 500);
    });

    const ROW_CYCLE = 2600;
    const rowCleanups = rows.map((v, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: false }),
          Animated.delay(650),
          Animated.timing(v, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: false }),
          Animated.delay(ROW_CYCLE - 300 - 650 - 300),
        ])
      );
      return startStaggeredLoop(loop, i * 250);
    });

    return () => {
      gps.stop();
      dotCleanups.forEach((c) => c());
      rowCleanups.forEach((c) => c());
    };
  }, []);

  const ringScale = gpsPing.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const ringOpacity = gpsPing.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={ilStyles.syncRow}>
      <View style={[ilStyles.phone, { borderColor: color }]}>
        <View style={[ilStyles.phoneNotch, { backgroundColor: color }]} />
        <View style={ilStyles.barMuted} />
        <View style={[ilStyles.barMuted, { width: '55%' }]} />
        <View style={ilStyles.gpsWrap}>
          <Animated.View
            style={[ilStyles.gpsRing, { borderColor: color, opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
          />
          <View style={[ilStyles.gpsDot, { backgroundColor: color }]} />
        </View>
        <View style={[ilStyles.barMuted, { width: '70%' }]} />
      </View>

      <View style={ilStyles.flowTrack}>
        {dots.map((v, i) => {
          const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-22, 22] });
          const opacity = v.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 1, 1, 0] });
          return (
            <Animated.View
              key={i}
              style={[ilStyles.flowDot, { backgroundColor: color, opacity, transform: [{ translateX }] }]}
            />
          );
        })}
      </View>

      <View style={[ilStyles.browser, { borderColor: color }]}>
        <View style={ilStyles.browserBar}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={ilStyles.browserBarDot} />
          ))}
        </View>
        {[0, 1, 2].map((i) => {
          const bg = rows[i].interpolate({ inputRange: [0, 1], outputRange: ['#e8f3fb', color] });
          return <Animated.View key={i} style={[ilStyles.browserRow, i === 1 && { width: '55%' }, { backgroundColor: bg }]} />;
        })}
      </View>
    </View>
  );
}

// Mirrors this app's real form card (app/index.web.tsx: title + a footer of
// "N fields" / "N entries" meta pills) instead of an abstract placeholder card.
function IllustrationGrid() {
  const CARDS: { title1: `${number}%`; title2: `${number}%`; fields: number; entries: number }[] = [
    { title1: '85%', title2: '55%', fields: 8, entries: 24 },
    { title1: '70%', title2: '45%', fields: 5, entries: 12 },
  ];
  const anims = useRef(CARDS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const CYCLE = 3200;
    const cleanups = anims.map((v, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 420, easing: OVERSHOOT, useNativeDriver: true }),
          Animated.delay(1700),
          Animated.timing(v, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
          Animated.delay(CYCLE - 420 - 1700 - 300),
        ])
      );
      return startStaggeredLoop(loop, i * 300);
    });
    return () => cleanups.forEach((c) => c());
  }, []);

  return (
    <View style={ilStyles.gridRow}>
      {CARDS.map((c, i) => {
        const opacity = anims[i];
        const scale = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
        const translateY = anims[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
        return (
          <Animated.View key={i} style={[ilStyles.gridCard, { opacity, transform: [{ scale }, { translateY }] }]}>
            <View style={ilStyles.gridCardTop}>
              <View style={[ilStyles.gridTitleBar, { width: c.title1 }]} />
              <View style={[ilStyles.gridTitleBar, ilStyles.gridTitleBarMuted, { width: c.title2 }]} />
            </View>
            <View style={ilStyles.gridCardFooter}>
              <View style={ilStyles.gridMetaPill}>
                <MaterialIcons name="format-list-bulleted" size={11} color="#7c8f9c" />
                <Text style={ilStyles.gridMetaText}>{c.fields}</Text>
              </View>
              <View style={[ilStyles.gridMetaPill, ilStyles.gridMetaPillActive]}>
                <MaterialIcons name="inbox" size={11} color="#2589C8" />
                <Text style={[ilStyles.gridMetaText, ilStyles.gridMetaTextActive]}>{c.entries}</Text>
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const TYPE_FRAMES = ['', 'D', 'Da', 'Dat', 'Date', 'Date: Jun', 'Date: Jun 2025', 'Date: Jun 2025', ''];

// Rows mirror components/EntryCard.tsx's real layout (numbered badge, title
// stack, GPS pill, chevron) instead of an abstract dot + bar.
function IllustrationSearch({ color }: { color: string }) {
  const [frame, setFrame] = useState(0);
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  const rowAnims = useRef([new Animated.Value(1), new Animated.Value(1)]).current;

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % TYPE_FRAMES.length), 480);
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 375, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 375, useNativeDriver: true }),
      ])
    );
    blink.start();

    const CYCLE = 2800;
    const cleanups = rowAnims.map((v, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 0, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: false }),
          Animated.delay(950),
          Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.in(Easing.ease), useNativeDriver: false }),
          Animated.delay(CYCLE - 280 - 950 - 280),
        ])
      );
      return startStaggeredLoop(loop, 1200 + i * 700);
    });

    return () => {
      clearInterval(id);
      blink.stop();
      cleanups.forEach((c) => c());
    };
  }, []);

  const ROWS: { title: `${number}%`; anim?: Animated.Value }[] = [
    { title: '82%' },
    { title: '62%', anim: rowAnims[0] },
    { title: '72%' },
    { title: '50%', anim: rowAnims[1] },
  ];

  return (
    <View style={ilStyles.searchCol}>
      <View style={[ilStyles.searchBar, { borderColor: color }]}>
        <MaterialIcons name="search" size={14} color={color} />
        <Text style={[ilStyles.searchText, { color }]} numberOfLines={1}>{TYPE_FRAMES[frame]}</Text>
        <Animated.View style={[ilStyles.searchCursor, { backgroundColor: color, opacity: cursorOpacity }]} />
      </View>
      {ROWS.map((r, i) => {
        const anim = r.anim;
        const opacity = anim ?? 1;
        const height = anim ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) : 28;
        return (
          <Animated.View key={i} style={[ilStyles.entryRow, { opacity, height }]}>
            <View style={ilStyles.entryNum}>
              <Text style={ilStyles.entryNumText}>{`0${i + 1}`}</Text>
            </View>
            <View style={ilStyles.entryTextCol}>
              <View style={ilStyles.entrySubtitleBar} />
              <View style={[ilStyles.entryTitleBar, { width: r.title }]} />
            </View>
            <View style={[ilStyles.entryGpsPill, { backgroundColor: color + '18' }]}>
              <MaterialIcons name="location-on" size={9} color={color} />
            </View>
            <MaterialIcons name="chevron-right" size={14} color="#c7d3da" />
          </Animated.View>
        );
      })}
    </View>
  );
}

function IllustrationBuilder({ color }: { color: string }) {
  const FIELDS = [
    { label: 'Location name', kind: 'text' as const },
    { label: 'Condition', kind: 'select' as const },
    { label: 'Photo', kind: 'photo' as const },
  ];
  const fieldAnims = useRef(FIELDS.map(() => new Animated.Value(0))).current;
  const addBtnAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const CYCLE = 3600;
    const fieldCleanups = fieldAnims.map((v, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.delay(1500),
          Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.ease), useNativeDriver: true }),
          Animated.delay(CYCLE - 320 - 1500 - 260),
        ])
      );
      return startStaggeredLoop(loop, 150 + i * 500);
    });

    const addLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(addBtnAnim, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.delay(700),
        Animated.timing(addBtnAnim, { toValue: 0.35, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.delay(1500),
      ])
    );
    const stopAdd = startStaggeredLoop(addLoop, 2600);

    return () => {
      fieldCleanups.forEach((c) => c());
      stopAdd();
    };
  }, []);

  return (
    <View style={[ilStyles.builderCard, { borderColor: color + '55', backgroundColor: color + '0d' }]}>
      {FIELDS.map((f, i) => {
        const opacity = fieldAnims[i];
        const translateY = fieldAnims[i].interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
        return (
          <Animated.View key={i} style={[ilStyles.builderField, { opacity, transform: [{ translateY }] }]}>
            <Text style={[ilStyles.builderLabel, { color }]}>{f.label.toUpperCase()}</Text>
            <View style={[ilStyles.builderInput, { borderColor: color + '55' }]}>
              {f.kind === 'text' && <View style={[ilStyles.builderText, { backgroundColor: color + '33' }]} />}
              {f.kind === 'select' && (
                <>
                  <View style={[ilStyles.builderText, { width: '50%', backgroundColor: color + '33' }]} />
                  <MaterialIcons name="arrow-drop-down" size={16} color={color} style={{ marginLeft: 'auto' }} />
                </>
              )}
              {f.kind === 'photo' && (
                <>
                  <MaterialIcons name="camera-alt" size={13} color={color} />
                  <Text style={ilStyles.builderPhotoLabel}>Add photo</Text>
                </>
              )}
            </View>
          </Animated.View>
        );
      })}
      <Animated.View style={[ilStyles.builderAddBtn, { borderColor: color, opacity: addBtnAnim }]}>
        <Text style={[ilStyles.builderAddLabel, { color }]}>+ Add field</Text>
      </Animated.View>
    </View>
  );
}

function IllustrationExport({ color }: { color: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const chips = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const check = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const PROGRESS_CYCLE = 3200;
    const progressLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.delay(PROGRESS_CYCLE - 1700),
      ])
    );
    progressLoop.start();

    const CHIP_CYCLE = 3200;
    const chipCleanups = chips.map((v, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(650),
          Animated.timing(v, { toValue: 1, duration: 160, useNativeDriver: false }),
          Animated.delay(500),
          Animated.timing(v, { toValue: 0, duration: 220, useNativeDriver: false }),
          Animated.delay(CHIP_CYCLE - 650 - 160 - 500 - 220),
        ])
      );
      return startStaggeredLoop(loop, i * 150);
    });

    const checkLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(1750),
        Animated.timing(check, { toValue: 1, duration: 260, easing: OVERSHOOT, useNativeDriver: true }),
        Animated.delay(700),
        Animated.timing(check, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(PROGRESS_CYCLE - 1750 - 260 - 700),
      ])
    );
    checkLoop.start();

    return () => {
      progressLoop.stop();
      chipCleanups.forEach((c) => c());
      checkLoop.stop();
    };
  }, []);

  const checkScale = check.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={ilStyles.exportRow}>
      <View style={[ilStyles.exportDoc, { borderColor: color }]}>
        {(['70%', '55%', '65%', '45%'] as const).map((w, i) => (
          <View key={i} style={[ilStyles.exportDocLine, { width: w, backgroundColor: color + '33' }]} />
        ))}
      </View>
      <View style={ilStyles.exportMain}>
        <View style={[ilStyles.exportTrack, { backgroundColor: color + '22' }]}>
          <Animated.View
            style={[
              ilStyles.exportFill,
              { backgroundColor: color, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
            ]}
          />
        </View>
        <View style={ilStyles.exportChips}>
          {['XLSX', 'CSV', 'ZIP'].map((label, i) => {
            const bg = chips[i].interpolate({ inputRange: [0, 1], outputRange: ['#fff', color] });
            const fg = chips[i].interpolate({ inputRange: [0, 1], outputRange: [color, '#fff'] });
            return (
              <Animated.View key={label} style={[ilStyles.exportChip, { borderColor: color, backgroundColor: bg }]}>
                <Animated.Text style={[ilStyles.exportChipText, { color: fg }]}>{label}</Animated.Text>
              </Animated.View>
            );
          })}
        </View>
      </View>
      <Animated.View style={[ilStyles.exportCheck, { backgroundColor: color, opacity: check, transform: [{ scale: checkScale }] }]}>
        <MaterialIcons name="check" size={16} color="#fff" />
      </Animated.View>
    </View>
  );
}

function IllustrationUsers({ color }: { color: string }) {
  const USERS: { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; tint: string }[] = [
    { icon: 'filter-alt', label: 'Filter', tint: color },
    { icon: 'swap-horiz', label: 'Transfer', tint: '#5bb8b8' },
    { icon: 'edit', label: 'Edit', tint: '#83cece' },
  ];
  const anims = useRef(USERS.map(() => new Animated.Value(0))).current;
  const pillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const CYCLE = 2800;
    const cleanups = anims.map((v, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 340, easing: OVERSHOOT, useNativeDriver: true }),
          Animated.delay(1550),
          Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.ease), useNativeDriver: true }),
          Animated.delay(CYCLE - 340 - 1550 - 260),
        ])
      );
      return startStaggeredLoop(loop, i * 420);
    });

    const pillLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pillAnim, { toValue: 1, duration: 340, easing: Easing.out(Easing.ease), useNativeDriver: false }),
        Animated.delay(1400),
        Animated.timing(pillAnim, { toValue: 0, duration: 260, easing: Easing.in(Easing.ease), useNativeDriver: false }),
        Animated.delay(300),
      ])
    );
    const stopPill = startStaggeredLoop(pillLoop, 1300);

    return () => {
      cleanups.forEach((c) => c());
      stopPill();
    };
  }, []);

  return (
    <View style={ilStyles.usersCol}>
      <View style={ilStyles.usersRow}>
        {USERS.map((u, i) => {
          const opacity = anims[i];
          const translateY = anims[i].interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
          const scale = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
          return (
            <Animated.View key={u.label} style={[ilStyles.userItem, { opacity, transform: [{ translateY }, { scale }] }]}>
              <View style={[ilStyles.userAvatar, { backgroundColor: u.tint }]}>
                <MaterialIcons name={u.icon} size={18} color="#fff" />
              </View>
              <Text style={[ilStyles.userRole, { backgroundColor: u.tint }]}>{u.label}</Text>
            </Animated.View>
          );
        })}
      </View>
      <Animated.View style={[ilStyles.usersPill, { borderColor: color, opacity: pillAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]}>
        <MaterialIcons name="person" size={12} color={color} />
        <Text style={[ilStyles.usersPillText, { color }]}>All users</Text>
      </Animated.View>
    </View>
  );
}

const ILLUSTRATIONS: React.ComponentType<{ color: string }>[] = [
  IllustrationSync,
  IllustrationGrid,
  IllustrationSearch,
  IllustrationBuilder,
  IllustrationExport,
  IllustrationUsers,
];

// Web-only onboarding tour. Metro resolves this in place of OnboardingModal.tsx
// when bundling for web (app/_layout.tsx imports the unsuffixed path), so no
// change is needed there. Content describes the web dashboard rather than the
// mobile app, and the admin-only last step is filtered via useAdminStore.
//
// Animation style is deliberately close in *feel* to Collector-Web's own tour
// (dashboard.js's _ob / dashboard.css's .ob-* / .ili-* rules) — springy
// overshoot card entrance, horizontal slide between steps, staggered
// title/description fade-up, a springy dot expansion, and per-step bespoke
// illustrations — reimplemented with RN's Animated API rather than CSS
// keyframes. Every looping illustration uses startStaggeredLoop() above so
// staggered items never drift out of phase with each other over time.
export default function OnboardingModal() {
  const { hasSeenOnboarding, currentStep, setHasSeenOnboarding, nextStep, manuallyOpened } = useOnboardingStore();
  const session = useAuthStore((s) => s.session);
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const colors = useAppColors();

  const steps = useMemo(() => ALL_STEPS.filter((s) => !s.adminOnly || isAdmin), [isAdmin]);
  const TOTAL = steps.length;

  const visible = manuallyOpened || (!!session && !hasSeenOnboarding);
  const safeStep = Math.min(currentStep, TOTAL - 1);
  const isLast = safeStep === TOTAL - 1;

  // Card entrance — overshoot scale + settle, like obCardIn.
  const cardScale = useRef(new Animated.Value(0.82)).current;
  const cardTranslateY = useRef(new Animated.Value(28)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  // Step slide — outgoing slides left & fades, incoming slides in from the right.
  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;

  // Title/description staggered fade-up.
  const titleAnim = useRef(new Animated.Value(0)).current;
  const descAnim = useRef(new Animated.Value(0)).current;

  const dotAnims = useRef(ALL_STEPS.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  // Guards against double-clicks (or two clicks landing before the ~480ms
  // transition finishes) starting a second, overlapping animation on the same
  // slideX/slideOpacity values — without this, an interrupted transition's
  // completion callback can leave the content stuck at opacity 0 (invisible)
  // and/or advance more than one step per click.
  const transitioningRef = useRef(false);

  const animateStepIn = () => {
    titleAnim.setValue(0);
    descAnim.setValue(0);
    Animated.timing(titleAnim, { toValue: 1, duration: 300, delay: 70, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(descAnim, { toValue: 1, duration: 300, delay: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  // Reset + play the entrance animation whenever the modal opens.
  useEffect(() => {
    if (!visible) return;
    transitioningRef.current = false;
    cardScale.setValue(0.82);
    cardTranslateY.setValue(28);
    cardOpacity.setValue(0);
    slideX.setValue(0);
    slideOpacity.setValue(1);
    dotAnims.forEach((d, i) => d.setValue(i === 0 ? 1 : 0));
    Animated.parallel([
      Animated.timing(cardScale, { toValue: 1, duration: 480, easing: OVERSHOOT, useNativeDriver: true }),
      Animated.timing(cardTranslateY, { toValue: 0, duration: 480, easing: OVERSHOOT, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    animateStepIn();
  }, [visible]);

  const animateDots = (toStep: number) => {
    ALL_STEPS.forEach((_, i) => {
      Animated.timing(dotAnims[i], {
        toValue: i === toStep ? 1 : 0,
        duration: 300,
        easing: Easing.bezier(0.34, 1.4, 0.64, 1),
        useNativeDriver: false,
      }).start();
    });
  };

  const goNext = () => {
    if (transitioningRef.current) return;
    if (isLast) {
      setHasSeenOnboarding();
      return;
    }
    transitioningRef.current = true;
    const nextIndex = safeStep + 1;
    // Outgoing step slides left & fades (obSlideOut).
    Animated.parallel([
      Animated.timing(slideX, { toValue: -56, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      Animated.timing(slideOpacity, { toValue: 0, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]).start(() => {
      nextStep();
      animateDots(nextIndex);
      animateStepIn();
      // Incoming step slides in from the right (obSlideIn).
      slideX.setValue(56);
      Animated.parallel([
        Animated.timing(slideX, { toValue: 0, duration: 280, easing: EASE_OUT, useNativeDriver: true }),
        Animated.timing(slideOpacity, { toValue: 1, duration: 280, easing: EASE_OUT, useNativeDriver: true }),
      ]).start(() => {
        transitioningRef.current = false;
      });
    });
  };

  if (!visible) return null;

  const step = steps[safeStep];
  const color = STEP_COLORS[safeStep % STEP_COLORS.length];
  const Illustration = ILLUSTRATIONS[safeStep];

  const titleOpacity = titleAnim;
  const titleTranslateY = titleAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const descOpacity = descAnim;
  const descTranslateY = descAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <Modal transparent animationType="none" visible>
      <View style={[styles.overlay, { backgroundColor: colors.overlay.scrim }]}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.background.white,
              opacity: cardOpacity,
              transform: [{ scale: cardScale }, { translateY: cardTranslateY }],
            },
          ]}
        >
          {/* Decorative tinted blobs, colored per-step like Collector-Web's .ob-blob */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[styles.blobLarge, { backgroundColor: color + '18' }]} />
            <View style={[styles.blobSmall, { backgroundColor: color + '12' }]} />
          </View>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={setHasSeenOnboarding}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 4 }}
          >
            <Text style={[styles.skipText, { color: colors.text.secondary }]}>Skip</Text>
          </TouchableOpacity>

          <Animated.View
            style={[styles.content, { opacity: slideOpacity, transform: [{ translateX: slideX }] }]}
          >
            <View key={safeStep} style={styles.illusWrap}>
              <Illustration color={color} />
            </View>

            <Animated.Text
              style={[
                styles.title,
                { color: colors.text.primary, opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] },
              ]}
            >
              {step.title}
            </Animated.Text>
            <Animated.Text
              style={[
                styles.description,
                { color: colors.text.secondary, opacity: descOpacity, transform: [{ translateY: descTranslateY }] },
              ]}
            >
              {step.description}
            </Animated.Text>
          </Animated.View>

          <View style={styles.dots}>
            {steps.map((_, i) => {
              const dotWidth = dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [8, 26] });
              const dotOpacity = dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
              return (
                <Animated.View
                  key={i}
                  style={[styles.dot, { width: dotWidth, opacity: dotOpacity, backgroundColor: color }]}
                />
              );
            })}
          </View>

          <TouchableOpacity style={[styles.nextButton, { backgroundColor: color }]} onPress={goNext} activeOpacity={0.85}>
            <Text style={styles.nextText}>{isLast ? 'Get started' : 'Next'}</Text>
            <MaterialIcons name={isLast ? 'check' : 'arrow-forward'} size={18} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 20,
    paddingTop: 20,
    paddingBottom: 26,
    paddingHorizontal: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 16,
  },
  blobLarge: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -90,
    right: -70,
  },
  blobSmall: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    bottom: -70,
    left: -60,
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    marginBottom: 4,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    alignItems: 'center',
  },
  illusWrap: {
    width: '100%',
    minHeight: 168,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 28,
  },
  description: {
    fontSize: 14.5,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    marginBottom: 18,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

// ── Illustration styles ───────────────────────────────────────────────────────

const ilStyles = StyleSheet.create({
  // Step 1: phone → browser sync
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  phone: {
    width: 58,
    height: 100,
    borderWidth: 2,
    borderRadius: 10,
    paddingTop: 12,
    paddingHorizontal: 7,
    paddingBottom: 7,
    gap: 4,
    backgroundColor: '#fff',
  },
  phoneNotch: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -9,
    width: 18,
    height: 4,
    borderRadius: 2,
  },
  barMuted: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#e3edf3',
    width: '100%',
  },
  gpsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 12,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gpsRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  flowTrack: {
    width: 44,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  browser: {
    width: 96,
    height: 100,
    borderWidth: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  browserBar: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: '#f0f7fd',
    borderBottomWidth: 1,
    borderBottomColor: '#d0e5f5',
  },
  browserBarDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#d0e5f5',
  },
  browserRow: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 8,
    marginTop: 8,
  },
  // Step 2: real-style form cards (title + fields/entries footer pills)
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  gridCard: {
    width: 128,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  gridCardTop: {
    padding: 10,
    gap: 5,
  },
  gridTitleBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#c3d3de',
  },
  gridTitleBarMuted: {
    backgroundColor: '#e3edf3',
  },
  gridCardFooter: {
    flexDirection: 'row',
    gap: 5,
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    backgroundColor: '#f7fafc',
  },
  gridMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  gridMetaPillActive: {
    backgroundColor: '#EAF6FD',
    borderColor: 'transparent',
  },
  gridMetaText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#7c8f9c',
  },
  gridMetaTextActive: {
    color: '#2589C8',
  },
  // Step 3: search bar + real-style entry-card rows
  searchCol: {
    width: '100%',
    maxWidth: 280,
    gap: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    borderWidth: 1.5,
    borderRadius: 7,
    paddingHorizontal: 9,
    backgroundColor: '#fff',
    marginBottom: 2,
  },
  searchText: {
    fontSize: 11,
    flex: 1,
  },
  searchCursor: {
    width: 1.5,
    height: 11,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e3edf3',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  entryNum: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: '#EAF6FD',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  entryNumText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#2589C8',
  },
  entryTextCol: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  entrySubtitleBar: {
    height: 4,
    width: '35%',
    borderRadius: 2,
    backgroundColor: '#dbe6ee',
  },
  entryTitleBar: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#aebac2',
  },
  entryGpsPill: {
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // Step 4: form builder
  builderCard: {
    width: '100%',
    maxWidth: 270,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 9,
    gap: 6,
  },
  builderField: {
    gap: 3,
  },
  builderLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  builderInput: {
    height: 21,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
  },
  builderText: {
    height: 5,
    borderRadius: 2.5,
    flex: 1,
  },
  builderPhotoLabel: {
    fontSize: 8.5,
    color: '#aaa',
  },
  builderAddBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 2,
  },
  builderAddLabel: {
    fontSize: 9,
    fontWeight: '700',
  },
  // Step 5: export
  exportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    maxWidth: 280,
  },
  exportDoc: {
    width: 44,
    height: 54,
    borderWidth: 2,
    borderRadius: 6,
    backgroundColor: '#fff',
    padding: 8,
    gap: 5,
    justifyContent: 'center',
  },
  exportDocLine: {
    height: 3.5,
    borderRadius: 2,
  },
  exportMain: {
    flex: 1,
    gap: 9,
  },
  exportTrack: {
    height: 9,
    borderRadius: 4.5,
    overflow: 'hidden',
  },
  exportFill: {
    height: '100%',
    borderRadius: 4.5,
  },
  exportChips: {
    flexDirection: 'row',
    gap: 6,
  },
  exportChip: {
    borderWidth: 1.5,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
  },
  exportChipText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  exportCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Step 6: admin users
  usersCol: {
    alignItems: 'center',
    gap: 14,
  },
  usersRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  userItem: {
    alignItems: 'center',
    gap: 5,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  userRole: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  usersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  usersPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
