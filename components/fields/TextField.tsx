import { memo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { FieldDef } from '../../types';

type Props = {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  numeric?: boolean;
};

function TextField({ field, value, onChange, error, numeric }: Props) {
  const [focused, setFocused] = useState(false);

  const handleChange = (text: string) => {
    onChange(numeric ? text.replace(/[^0-9.,-]/g, '') : text);
  };

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
        onChangeText={handleChange}
        placeholder={field.placeholder}
        placeholderTextColor="#7a847f"
        keyboardType={numeric ? 'numeric' : 'default'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
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
  input: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B8C9D4',
    backgroundColor: '#fff',
    fontSize: 15,
    color: '#171d1b',
  },
  inputFocused: {
    borderColor: '#2589C8',
    shadowColor: '#2589C8',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  inputError: {
    borderColor: '#ba1a1a',
  },
  errorText: {
    fontSize: 12,
    color: '#ba1a1a',
    marginTop: 5,
  },
});

export default memo(TextField);
