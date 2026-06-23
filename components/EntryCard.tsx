import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Entry, PhotoItem } from '../types';
import { timeAgo } from '../utils/timeUtils';
import { colors } from '../theme/colors';

const SYNC_STATUS_META: Record<
  string,
  { icon: keyof typeof MaterialIcons.glyphMap; color: string }
> = {
  pending: { icon: 'cloud-queue', color: colors.text.muted },
  syncing: { icon: 'cloud-upload', color: colors.brand.primary },
  synced: { icon: 'cloud-done', color: colors.brand.primary },
  error: { icon: 'cloud-off', color: colors.action.delete },
};

type Props = {
  entry: Entry;
  displayNumber: number;
  onOpen: () => void;
  onDelete?: () => void;
  showCoords?: boolean;
};

function EntryCard({ entry, displayNumber, onOpen }: Props) {
  const { createdAt, formTitle, fields, data } = entry;
  const displayLabel = `#${String(displayNumber).padStart(2, '0')}`;

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
      return fields
        .filter((f) => f.type === 'image')
        .reduce((sum, f) => sum + (data[f.id] ?? []).length, 0);
    }
    return (data.photo ?? []).length;
  })();

  const firstPhotoUri = (() => {
    const findUri = (photos: unknown): string | null => {
      if (!Array.isArray(photos)) return null;
      const first = photos.find((photo): photo is PhotoItem => {
        return !!photo && typeof photo === 'object' && typeof (photo as PhotoItem).uri === 'string';
      });
      return first?.uri ?? null;
    };

    if (fields) {
      for (const field of fields) {
        if (field.type !== 'image') continue;
        const uri = findUri(data[field.id]);
        if (uri) return uri;
      }
      return null;
    }

    return findUri(data.photo);
  })();

  const hasRating = fields
    ? fields.some((f) => f.type === 'rating' && data[f.id] > 0)
    : (data.rating ?? 0) > 0;

  const totalFields = fields ? fields.length : Object.keys(data).length;

  const syncMeta = entry.syncStatus ? SYNC_STATUS_META[entry.syncStatus] : null;

  const handleSyncBadgePress = () => {
    if (entry.syncStatus === 'error' && entry.syncError) {
      Alert.alert('Sync error', entry.syncError);
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onOpen} activeOpacity={0.72}>
      {/* Left: entry number or first photo */}
      {firstPhotoUri ? (
        <View style={styles.thumbnailWrap}>
          <Image source={{ uri: firstPhotoUri }} style={styles.thumbnail} resizeMode="cover" />
        </View>
      ) : (
        <View style={styles.numBadge}>
          <Text style={styles.numText}>{displayLabel}</Text>
        </View>
      )}

      {/* Center: content */}
      <View style={styles.body}>
        <View style={styles.topRow}>
          {formTitle ? (
            <Text style={styles.formName} numberOfLines={1}>{formTitle}</Text>
          ) : null}
          <View style={styles.topRowRight}>
            {syncMeta &&
              (entry.syncStatus === 'error' ? (
                <TouchableOpacity onPress={handleSyncBadgePress} hitSlop={8}>
                  <MaterialIcons name={syncMeta.icon} size={14} color={syncMeta.color} />
                </TouchableOpacity>
              ) : (
                <MaterialIcons name={syncMeta.icon} size={14} color={syncMeta.color} />
              ))}
            <Text style={styles.ago}>{timeAgo(createdAt)}</Text>
          </View>
        </View>

        <Text style={styles.preview} numberOfLines={1}>
          {previewTitle ?? `Entry ${displayLabel}`}
        </Text>

        {/* Indicators */}
        <View style={styles.indicators}>
          {photoCount > 0 && (
            <View style={styles.pill}>
              <MaterialIcons name="photo" size={12} color={colors.text.secondary} />
              <Text style={styles.pillText}>{photoCount}</Text>
            </View>
          )}
          {hasGps && (
            <View style={styles.pill}>
              <MaterialIcons name="location-on" size={12} color={colors.brand.primary} />
              <Text style={[styles.pillText, { color: colors.brand.primary }]}>GPS</Text>
            </View>
          )}
          {hasRating && (
            <View style={styles.pill}>
              <MaterialIcons name="star" size={12} color={colors.text.warning} />
            </View>
          )}
          <View style={[styles.pill, styles.countPill]}>
            <Text style={styles.countText}>{totalFields} {totalFields === 1 ? 'field' : 'fields'}</Text>
          </View>
        </View>
      </View>

      {/* Right: chevron */}
      <MaterialIcons name="chevron-right" size={20} color={colors.border.input} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 14,
  },

  numBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.background.soft,
    borderWidth: 1,
    borderColor: colors.border.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.primary,
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
    color: colors.text.secondary,
    letterSpacing: 0.3,
    flex: 1,
  },
  ago: {
    fontSize: 11,
    color: colors.text.muted,
    flexShrink: 0,
  },
  topRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },

  preview: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
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
    backgroundColor: colors.background.fieldSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 100,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  countPill: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  countText: {
    fontSize: 11,
    color: colors.text.muted,
  },
  thumbnailWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.background.soft,
    borderWidth: 1,
    borderColor: colors.border.soft,
    flexShrink: 0,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
});

export default memo(EntryCard);
