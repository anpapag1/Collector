import React, { memo, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef } from '../../types';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

type Props = {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
};

function formatIsoDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function DateField({ field, value, onChange, error }: Props) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (field.auto) {
    return (
      <View>
        <Text style={styles.label}>{field.label}</Text>
        <View style={styles.autoBox}>
          <MaterialIcons name="event" size={18} color={colors.text.secondary} />
          <Text style={styles.autoText}>{formatIsoDate(value) || '—'}</Text>
        </View>
      </View>
    );
  }

  const dateObj = value && !isNaN(new Date(value).getTime()) ? new Date(value) : new Date();

  return (
    <View>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[styles.input, error && styles.inputError]}
        onPress={() => setPickerOpen(true)}
        activeOpacity={0.7}
      >
        <MaterialIcons name="event" size={18} color={colors.text.secondary} />
        <Text style={[styles.inputText, !value && styles.placeholderText]}>
          {value ? formatIsoDate(value) : 'Select a date'}
        </Text>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>Required</Text>}

      {pickerOpen && (
        <>
          <DateTimePicker
            value={dateObj}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onValueChange={(event, selected) => {
              if (Platform.OS === 'android') {
                // Android's native dialog closes itself after a selection or dismissal.
                setPickerOpen(false);
                if (selected) {
                  onChange(selected.toISOString());
                }
              } else {
                // iOS inline/spinner pickers fire 'set' continuously while scrolling,
                // so only update the value here — keep the picker open until the
                // user explicitly taps Done.
                if (selected) {
                  onChange(selected.toISOString());
                }
              }
            }}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setPickerOpen(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}
        </>
      )}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.input,
    backgroundColor: colors.background.white,
  },
  inputError: { borderColor: colors.text.danger },
  inputText: {
    fontSize: 15,
    color: colors.text.primary,
  },
  placeholderText: {
    color: colors.text.placeholder,
  },
  errorText: { fontSize: 12, color: colors.text.danger, marginTop: 5 },
  doneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.brand.primary,
  },
  autoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.soft,
  },
  autoText: {
    fontSize: 15,
    color: colors.text.secondary,
    fontWeight: '500',
  },
});

export default memo(DateField);
