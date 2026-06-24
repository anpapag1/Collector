import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef } from '../../types';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

type Props = {
  field: FieldDef;
  value: boolean;
  onChange: (v: boolean) => void;
  error?: boolean;
};

function BooleanField({ field, value, onChange, error }: Props) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  return (
    <View>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.option, value === true && styles.optionActiveYes]}
          onPress={() => onChange(true)}
          activeOpacity={0.75}
        >
          <MaterialIcons
            name="check"
            size={18}
            color={value === true ? colors.text.inverse : colors.text.secondary}
          />
          <Text style={[styles.optionText, value === true && styles.optionTextActive]}>
            Yes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, value === false && styles.optionActiveNo]}
          onPress={() => onChange(false)}
          activeOpacity={0.75}
        >
          <MaterialIcons
            name="close"
            size={18}
            color={value === false ? colors.text.inverse : colors.text.secondary}
          />
          <Text style={[styles.optionText, value === false && styles.optionTextActive]}>
            No
          </Text>
        </TouchableOpacity>
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
    marginBottom: 7,
  },
  required: {
    color: colors.text.danger,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.input,
    backgroundColor: colors.background.white,
  },
  optionActiveYes: {
    backgroundColor: colors.action.primary,
    borderColor: colors.action.primary,
  },
  optionActiveNo: {
    backgroundColor: colors.action.danger,
    borderColor: colors.action.danger,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  optionTextActive: {
    color: colors.text.inverse,
  },
  errorText: {
    fontSize: 12,
    color: colors.text.danger,
    marginTop: 5,
  },
});

export default memo(BooleanField);
