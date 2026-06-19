import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef } from '../../types';

type Props = {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
};

export default function SelectField({ field, value, onChange, error }: Props) {
  return (
    <View>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.chips}>
        {(field.options ?? []).map((opt) => {
          const selected = opt === value;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(opt)}
              activeOpacity={0.7}
            >
              {selected && (
                <MaterialIcons name="check" size={16} color="#00201c" />
              )}
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {error && <Text style={styles.errorText}>Required</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3f4946',
    marginBottom: 9,
  },
  required: { color: '#ba1a1a' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#bec9c4',
    backgroundColor: 'transparent',
  },
  chipSelected: {
    borderColor: 'transparent',
    backgroundColor: '#9ef2e1',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3f4946',
  },
  chipTextSelected: {
    color: '#00201c',
  },
  errorText: { fontSize: 12, color: '#ba1a1a', marginTop: 6 },
});
