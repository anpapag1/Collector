import React, { memo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FormSection } from '../../types';
import { generateSectionId } from '../../utils/formBuilderSerializer';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

type Props = {
  sections: FormSection[];
  onChange: (sections: FormSection[]) => void;
};

function SectionsPanel({ sections, onChange }: Props) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);

  const updateTitle = (index: number, title: string) => {
    const next = [...sections];
    next[index] = { ...next[index], title };
    onChange(next);
  };

  const removeSection = (index: number) => {
    onChange(sections.filter((_, i) => i !== index));
  };

  const addSection = () => {
    const existingIds = new Set(sections.map((s) => s.id));
    const id = generateSectionId(`section-${sections.length + 1}`, existingIds);
    onChange([...sections, { id, title: '' }]);
  };

  return (
    <View style={styles.container}>
      {sections.map((section, index) => (
        <View key={section.id} style={styles.row}>
          <Text style={styles.index}>{index + 1}</Text>
          <TextInput
            style={styles.input}
            value={section.title}
            onChangeText={(title) => updateTitle(index, title)}
            placeholder="Section title"
            placeholderTextColor={colors.text.placeholder}
          />
          <TouchableOpacity onPress={() => removeSection(index)} style={styles.removeBtn}>
            <MaterialIcons name="close" size={16} color={colors.text.muted} />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={addSection}>
        <Text style={styles.addBtnText}>+ Add section</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: { gap: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background.muted,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    index: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.text.muted,
      width: 16,
    },
    input: {
      flex: 1,
      fontSize: 13.5,
      color: colors.text.primary,
      paddingVertical: 4,
    },
    removeBtn: { padding: 4 },
    addBtn: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border.input,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 4,
    },
    addBtnText: { fontSize: 13, fontWeight: '600', color: colors.brand.primary },
  });

export default memo(SectionsPanel);
