import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { router, usePathname } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useAdminStore } from '../../store/adminStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';
import { AppColors } from '../../theme/colors';
import LogoSvg from '../../assets/Collector_Logo.svg';

const TABS: { href: '/' | '/map' | '/export'; label: string }[] = [
  { href: '/', label: 'Forms' },
  { href: '/map', label: 'Map' },
  { href: '/export', label: 'Export' },
];

// Shared top nav for the web dashboard screens. Native has no equivalent —
// each mobile screen owns its own top bar instead of a persistent nav, and
// this follows the same "screen owns its chrome" convention rather than
// introducing a shared layout wrapper.
export default function DashboardNav() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const isCompact = width < 860;
  const isPhone = width < 480;
  const pathname = usePathname();
  const signOut = useAuthStore((s) => s.signOut);
  const email = useAuthStore((s) => s.user?.email);

  const isAdmin = useAdminStore((s) => s.isAdmin);
  const profiles = useAdminStore((s) => s.profiles);
  const ownerFilter = useAdminStore((s) => s.ownerFilter);
  const setOwnerFilter = useAdminStore((s) => s.setOwnerFilter);

  const [menuOpen, setMenuOpen] = useState(false);

  const activeLabel = ownerFilter === 'all' 
    ? 'All users' 
    : ownerFilter === 'mine' 
      ? 'Mine' 
      : profiles.find(p => p.id === ownerFilter)?.email ?? ownerFilter;

  return (
    <View style={[styles.bar, isCompact && styles.barCompact]}>
      <View style={[styles.inner, isCompact && styles.innerCompact]}>
        <View style={[styles.left, isCompact && styles.leftCompact]}>
          <View style={styles.logoGroup}>
            <View style={styles.logoIconBg}>
              <LogoSvg width={38} height={38} />
            </View>
            {!isPhone && <Text style={styles.brand}>Collector</Text>}
          </View>
          <View style={styles.tabsContainer}>
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <TouchableOpacity
                  key={tab.href}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => router.push(tab.href)}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
            {isAdmin && (
              <TouchableOpacity
                style={[styles.tab, pathname === '/settings' && styles.tabActive]}
                onPress={() => router.push('/settings')}
              >
                <Text style={[styles.tabLabel, pathname === '/settings' && styles.tabLabelActive]}>
                  Settings
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={[styles.right, isCompact && styles.rightCompact]}>
        {isAdmin && (
          <View style={[styles.filterContainer, isPhone && styles.filterContainerPhone]}>
            <TouchableOpacity
              style={styles.filterBtn}
              onPress={() => setMenuOpen(!menuOpen)}
            >
              <MaterialIcons name="person" size={16} color="#0369A1" />
              <Text style={[styles.filterBtnText, isPhone && styles.filterBtnTextPhone]} numberOfLines={1}>{activeLabel}</Text>
              <MaterialIcons name={menuOpen ? "expand-less" : "expand-more"} size={16} color={colors.text.secondary} />
            </TouchableOpacity>
            {menuOpen && (
              <View style={styles.filterMenu}>
                <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                  {[
                    { value: 'all', label: 'All users' },
                    { value: 'mine', label: 'Mine' },
                    ...profiles.map(p => ({ value: p.id, label: p.email }))
                  ].map(opt => (
                    <TouchableOpacity 
                      key={opt.value} 
                      style={[styles.filterMenuOption, opt.value === ownerFilter && styles.filterMenuOptionActive]}
                      onPress={() => {
                        setOwnerFilter(opt.value as any);
                        setMenuOpen(false);
                      }}
                    >
                      <Text style={[styles.filterMenuOptionText, opt.value === ownerFilter && styles.filterMenuOptionTextActive]} numberOfLines={1}>
                        {opt.label}
                      </Text>
                      {opt.value === ownerFilter && (
                        <MaterialIcons name="check" size={16} color={colors.brand.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}
        <TouchableOpacity style={[styles.tourBtn, isPhone && styles.tourBtnPhone]} onPress={() => useOnboardingStore.getState().openTour()}>
          <MaterialIcons name="help-outline" size={16} color={colors.text.secondary} />
          {!isPhone && <Text style={styles.tourLabel}>Tour</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.signOutBtn, isPhone && styles.signOutBtnPhone]} onPress={() => signOut()}>
          <Text style={styles.signOutLabel}>{isPhone ? 'Out' : 'Sign out'}</Text>
        </TouchableOpacity>
      </View>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  bar: {
    paddingHorizontal: 32,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
    backgroundColor: colors.background.white,
    zIndex: 100, // Ensure the dropdown sits above page content
  },
  barCompact: {
    paddingHorizontal: 16,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    minHeight: 64,
  },
  innerCompact: {
    flexWrap: 'wrap',
    rowGap: 10,
    paddingVertical: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  leftCompact: {
    gap: 16,
    flexWrap: 'wrap',
    rowGap: 8,
  },
  logoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIconBg: {
    width: 40,
    height: 40,
    backgroundColor: colors.brand.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    alignSelf: 'stretch',
  },
  tab: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.brand.primary,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  tabLabelActive: {
    color: colors.brand.primary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    zIndex: 100, // For dropdown stacking context
  },
  rightCompact: {
    gap: 8,
    flexWrap: 'wrap',
    rowGap: 8,
  },
  filterContainer: {
    position: 'relative',
    marginRight: 8,
    zIndex: 100,
  },
  filterContainerPhone: {
    marginRight: 0,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#E0F2FE', // light cyan
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0369A1',
    maxWidth: 160,
  },
  filterBtnTextPhone: {
    maxWidth: 90,
  },
  filterMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    backgroundColor: colors.background.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    width: 220,
    overflow: 'hidden',
    zIndex: 1000,
  },
  filterMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterMenuOptionActive: {
    backgroundColor: colors.brand.primarySoft,
  },
  filterMenuOptionText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
  },
  filterMenuOptionTextActive: {
    fontWeight: '600',
    color: colors.brand.primary,
  },
  tourBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  tourBtnPhone: {
    paddingHorizontal: 10,
  },
  tourLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  signOutBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.background.white,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  signOutBtnPhone: {
    paddingHorizontal: 10,
  },
  signOutLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand.primary,
  },
});
