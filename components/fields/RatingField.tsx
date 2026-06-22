import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef } from '../../types';

type Props = {
  field: FieldDef;
  value: number;
  onChange: (v: number) => void;
  error?: boolean;
};

function RatingField({ field, value, onChange, error }: Props) {
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
              color={n <= value ? '#006a60' : '#c6d0cc'}
            />
          </TouchableOpacity>
        ))}
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
  stars: {
    flexDirection: 'row',
    gap: 8,
  },
  errorText: { fontSize: 12, color: '#ba1a1a', marginTop: 6 },
});

export default memo(RatingField);
