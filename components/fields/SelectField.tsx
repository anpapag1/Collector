import { memo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef, SelectValue } from '../../types';
import { isOtherValue } from '../../utils/formLogic';

type Props = {
  field: FieldDef;
  value: SelectValue | SelectValue[];
  onChange: (v: SelectValue | SelectValue[]) => void;
  error?: boolean;
};

const OTHER_LABEL = 'Other';

function SelectField({ field, value, onChange, error }: Props) {
  const multi = !!field.multiple;
  const selected: SelectValue[] = multi
    ? Array.isArray(value) ? value : []
    : value ? [value as SelectValue] : [];

  const otherEntry = selected.find(isOtherValue) as { value: 'Other'; otherText: string } | undefined;
  const otherSelected = !!otherEntry;

  const isOptSelected = (opt: string) => selected.some((s) => !isOtherValue(s) && s === opt);

  const toggleOption = (opt: string) => {
    if (multi) {
      const current = Array.isArray(value) ? value : [];
      onChange(
        isOptSelected(opt)
          ? current.filter((v) => isOtherValue(v) || v !== opt)
          : [...current, opt],
      );
    } else {
      onChange(isOptSelected(opt) ? '' : opt);
    }
  };

  const toggleOther = () => {
    if (multi) {
      const current = Array.isArray(value) ? value : [];
      onChange(
        otherSelected
          ? current.filter((v) => !isOtherValue(v))
          : [...current, { value: 'Other', otherText: '' }],
      );
    } else {
      onChange(otherSelected ? '' : { value: 'Other', otherText: '' });
    }
  };

  const setOtherText = (text: string) => {
    const next: SelectValue = { value: 'Other', otherText: text };
    if (multi) {
      const current = Array.isArray(value) ? value : [];
      onChange([...current.filter((v) => !isOtherValue(v)), next]);
    } else {
      onChange(next);
    }
  };

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {field.label}
          {field.required && <Text style={styles.required}> *</Text>}
        </Text>
        {multi && selected.length > 0 && (
          <Text style={styles.count}>{selected.length} selected</Text>
        )}
      </View>

      <View style={styles.chips}>
        {(field.options ?? []).map((opt) => {
          const isSelected = isOptSelected(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => toggleOption(opt)}
              activeOpacity={0.7}
            >
              {isSelected && (
                <MaterialIcons name="check" size={15} color="#00201c" />
              )}
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}

        {field.allowOther && (
          <TouchableOpacity
            style={[styles.chip, otherSelected && styles.chipSelected]}
            onPress={toggleOther}
            activeOpacity={0.7}
          >
            {otherSelected && (
              <MaterialIcons name="check" size={15} color="#00201c" />
            )}
            <Text style={[styles.chipText, otherSelected && styles.chipTextSelected]}>
              {OTHER_LABEL}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {otherSelected && (
        <TextInput
          style={styles.otherInput}
          value={otherEntry?.otherText ?? ''}
          onChangeText={setOtherText}
          placeholder="Please specify…"
          placeholderTextColor="#7a847f"
          multiline
        />
      )}

      {error && <Text style={styles.errorText}>Required</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3f4946',
  },
  required: { color: '#ba1a1a' },
  count: {
    fontSize: 12,
    fontWeight: '600',
    color: '#006a60',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  otherInput: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bec9c4',
    backgroundColor: '#fff',
    fontSize: 14,
    color: '#171d1b',
    minHeight: 44,
    textAlignVertical: 'top',
  },
  errorText: { fontSize: 12, color: '#ba1a1a', marginTop: 6 },
});

export default memo(SelectField);
