import { memo, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef } from '../../types';

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
  const [pickerOpen, setPickerOpen] = useState(false);

  if (field.auto) {
    return (
      <View>
        <Text style={styles.label}>{field.label}</Text>
        <View style={styles.autoBox}>
          <MaterialIcons name="event" size={18} color="#3f4946" />
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
        <MaterialIcons name="event" size={18} color="#3f4946" />
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
            onChange={(event, selected) => {
              if (Platform.OS === 'android') {
                // Android's native dialog closes itself after a selection or dismissal.
                setPickerOpen(false);
                if (event.type === 'set' && selected) {
                  onChange(selected.toISOString());
                }
              } else {
                // iOS inline/spinner pickers fire 'set' continuously while scrolling,
                // so only update the value here — keep the picker open until the
                // user explicitly taps Done.
                if (event.type === 'set' && selected) {
                  onChange(selected.toISOString());
                } else if (event.type === 'dismissed') {
                  setPickerOpen(false);
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

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3f4946',
    marginBottom: 7,
  },
  required: { color: '#ba1a1a' },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bec9c4',
    backgroundColor: '#fff',
  },
  inputError: { borderColor: '#ba1a1a' },
  inputText: {
    fontSize: 15,
    color: '#171d1b',
  },
  placeholderText: {
    color: '#7a847f',
  },
  errorText: { fontSize: 12, color: '#ba1a1a', marginTop: 5 },
  doneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#006a60',
  },
  autoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d3e0db',
    backgroundColor: '#eef5f1',
  },
  autoText: {
    fontSize: 15,
    color: '#3f4946',
    fontWeight: '500',
  },
});

export default memo(DateField);
