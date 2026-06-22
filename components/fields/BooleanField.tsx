import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef } from '../../types';

type Props = {
  field: FieldDef;
  value: boolean;
  onChange: (v: boolean) => void;
  error?: boolean;
};

function BooleanField({ field, value, onChange, error }: Props) {
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
            color={value === true ? '#fff' : '#3f4946'}
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
            color={value === false ? '#fff' : '#3f4946'}
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

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3f4946',
    marginBottom: 7,
  },
  required: {
    color: '#ba1a1a',
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
    borderColor: '#bec9c4',
    backgroundColor: '#fff',
  },
  optionActiveYes: {
    backgroundColor: '#006a60',
    borderColor: '#006a60',
  },
  optionActiveNo: {
    backgroundColor: '#ba1a1a',
    borderColor: '#ba1a1a',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3f4946',
  },
  optionTextActive: {
    color: '#fff',
  },
  errorText: {
    fontSize: 12,
    color: '#ba1a1a',
    marginTop: 5,
  },
});

export default memo(BooleanField);
