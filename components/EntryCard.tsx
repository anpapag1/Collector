import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Entry } from '../types';
import { timeAgo } from '../utils/timeUtils';

type Props = {
  entry: Entry;
  onOpen: () => void;
  onDelete?: () => void;
  showCoords?: boolean;
};

function EntryCard({ entry, onOpen }: Props) {
  const { seq, createdAt, formTitle, fields, data } = entry;

  // Pull first meaningful text value as preview title
  const previewTitle = (() => {
    if (fields) {
      for (const f of fields) {
        if ((f.type === 'text' || f.type === 'textarea') && data[f.id]) {
          const val = String(data[f.id]).trim();
          if (val) return val;
        }
      }
    } else {
      // Legacy: scan data values
      for (const v of Object.values(data)) {
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return null;
  })();

  // Count meaningful field types present
  const hasGps = fields
    ? fields.some((f) => f.type === 'gps' && data[f.id])
    : typeof data.location?.lat === 'number';

  const photoCount = (() => {
    if (fields) {
      const imgField = fields.find((f) => f.type === 'image');
      return imgField ? (data[imgField.id] ?? []).length : 0;
    }
    return (data.photo ?? []).length;
  })();

  const hasRating = fields
    ? fields.some((f) => f.type === 'rating' && data[f.id] > 0)
    : (data.rating ?? 0) > 0;

  const totalFields = fields ? fields.length : Object.keys(data).length;

  return (
    <TouchableOpacity style={styles.card} onPress={onOpen} activeOpacity={0.72}>
      {/* Left: entry number */}
      <View style={styles.numBadge}>
        <Text style={styles.numText}>#{String(seq).padStart(2, '0')}</Text>
      </View>

      {/* Center: content */}
      <View style={styles.body}>
        <View style={styles.topRow}>
          {formTitle ? (
            <Text style={styles.formName} numberOfLines={1}>{formTitle}</Text>
          ) : null}
          <Text style={styles.ago}>{timeAgo(createdAt)}</Text>
        </View>

        <Text style={styles.preview} numberOfLines={1}>
          {previewTitle ?? `Entry #${String(seq).padStart(2, '0')}`}
        </Text>

        {/* Indicators */}
        <View style={styles.indicators}>
          {photoCount > 0 && (
            <View style={styles.pill}>
              <MaterialIcons name="photo" size={12} color="#3f4946" />
              <Text style={styles.pillText}>{photoCount}</Text>
            </View>
          )}
          {hasGps && (
            <View style={styles.pill}>
              <MaterialIcons name="location-on" size={12} color="#2589C8" />
              <Text style={[styles.pillText, { color: '#2589C8' }]}>GPS</Text>
            </View>
          )}
          {hasRating && (
            <View style={styles.pill}>
              <MaterialIcons name="star" size={12} color="#a07a00" />
            </View>
          )}
          <View style={[styles.pill, styles.countPill]}>
            <Text style={styles.countText}>{totalFields} {totalFields === 1 ? 'field' : 'fields'}</Text>
          </View>
        </View>
      </View>

      {/* Right: chevron */}
      <MaterialIcons name="chevron-right" size={20} color="#B8C9D4" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3F0F8',
    padding: 14,
  },

  numBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F8FD',
    borderWidth: 1,
    borderColor: '#CFEAFA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2589C8',
    letterSpacing: 0.3,
  },

  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  formName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3f4946',
    letterSpacing: 0.3,
    flex: 1,
  },
  ago: {
    fontSize: 11,
    color: '#8EA8B8',
    flexShrink: 0,
  },

  preview: {
    fontSize: 15,
    fontWeight: '600',
    color: '#171d1b',
  },

  indicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F3F8FC',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 100,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#3f4946',
  },
  countPill: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  countText: {
    fontSize: 11,
    color: '#8EA8B8',
  },
});

export default memo(EntryCard);
