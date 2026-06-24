import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef, PhotoItem } from '../../types';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

type Props = {
  field: FieldDef;
  value: PhotoItem[];
  onChange: (v: PhotoItem[]) => void;
  onAddPress: () => void;
};

function ImageField({ field, value, onChange, onAddPress }: Props) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const remove = (id: string) => onChange(value.filter((p) => p.id !== id));

  return (
    <View>
      <Text style={styles.label}>{field.label}</Text>
      <View style={styles.grid}>
        {value.map((photo) => (
          <View key={photo.id} style={styles.tile}>
            <Image source={{ uri: photo.uri }} style={styles.image} resizeMode="cover" />
            <TouchableOpacity style={styles.removeBtn} onPress={() => remove(photo.id)}>
              <MaterialIcons name="close" size={15} color={colors.text.inverse} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addTile} onPress={onAddPress}>
          <MaterialIcons name="add-a-photo" size={24} color={colors.brand.primary} />
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 9,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: 84,
    height: 84,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border.image,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.overlay.imageScrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 84,
    height: 84,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border.disabled,
    backgroundColor: colors.background.soft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.brand.primary,
  },
});

export default memo(ImageField);
