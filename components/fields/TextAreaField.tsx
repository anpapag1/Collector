import React, { memo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { FieldDef } from '../../types';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

type Props = {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
};

function TextAreaField({ field, value, onChange, error }: Props) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor={colors.text.placeholder}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
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
  required: { color: colors.text.danger },
  input: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.input,
    backgroundColor: colors.background.white,
    fontSize: 15,
    color: colors.text.primary,
    minHeight: 96,
  },
  inputFocused: {
    borderColor: colors.brand.primary,
    shadowColor: colors.brand.primary,
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  inputError: { borderColor: colors.text.danger },
  errorText: { fontSize: 12, color: colors.text.danger, marginTop: 5 },
});

export default memo(TextAreaField);
