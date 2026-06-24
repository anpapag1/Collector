import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef } from '../../types';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

type Props = {
  field: FieldDef;
  value: number;
  onChange: (v: number) => void;
  error?: boolean;
};

function RatingField({ field, value, onChange, error }: Props) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const max = field.max ?? 5;

  return (
    <View>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.stars}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7}>
            <MaterialIcons
              name={n <= value ? 'star' : 'star-border'}
              size={34}
              color={n <= value ? colors.brand.primary : colors.border.ratingEmpty}
            />
          </TouchableOpacity>
        ))}
      </View>
      {error && <Text style={styles.errorText}>Required</Text>}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 9,
  },
  required: { color: colors.text.danger },
  stars: {
    flexDirection: 'row',
    gap: 8,
  },
  errorText: { fontSize: 12, color: colors.text.danger, marginTop: 6 },
});

export default memo(RatingField);
