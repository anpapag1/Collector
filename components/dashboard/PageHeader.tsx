import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';
import { AppColors } from '../../theme/colors';

interface PageHeaderProps {
  kicker: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}

export default function PageHeader({ kicker, title, subtitle, children }: PageHeaderProps) {
  const styles = useThemedStyles(createStyles);
  
  return (
    <View style={styles.pageHeader}>
      <View style={styles.headerText}>
        <Text style={styles.pageKicker}>{kicker}</Text>
        <Text style={styles.pageTitle}>{title}</Text>
        <Text style={styles.pageSubtitle}>{subtitle}</Text>
      </View>
      {children && (
        <View style={styles.headerActions}>
          {children}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  pageHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 36,
    gap: 16,
    zIndex: 100,
  },
  headerText: {
    flexShrink: 1,
    minWidth: 220,
  },
  pageKicker: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.brand.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    backgroundColor: colors.brand.primarySoft,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: -1,
  },
  pageSubtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    marginTop: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
