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

export default function EntryCard({ entry, onOpen, onDelete, showCoords }: Props) {
  const name = entry.data.site_name ?? '—';
  const category = entry.data.category ?? '';
  const rating: number = entry.data.rating ?? 0;
  const photos: any[] = entry.data.photo ?? [];
  const location = entry.data.location;
  const num = '#' + String(entry.seq).padStart(2, '0');

  return (
    <TouchableOpacity style={styles.card} onPress={onOpen} activeOpacity={0.75}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{num}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{category}</Text>
          {!!category && <View style={styles.dot} />}
          <Text style={styles.metaText}>{timeAgo(entry.createdAt)}</Text>
        </View>
        <View style={styles.row}>
          {/* Stars */}
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <MaterialIcons
                key={i}
                name={i <= rating ? 'star' : 'star-border'}
                size={15}
                color={i <= rating ? '#006a60' : '#c6d0cc'}
              />
            ))}
          </View>
          {photos.length > 0 && (
            <View style={styles.pill}>
              <MaterialIcons name="photo-camera" size={14} color="#3f4946" />
              <Text style={styles.pillText}>{photos.length}</Text>
            </View>
          )}
          {!!location && (
            <MaterialIcons name="location-on" size={16} color="#006a60" />
          )}
          {showCoords && !!location && (
            <Text style={styles.coords}>
              {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
            </Text>
          )}
        </View>
      </View>

      {onDelete ? (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="delete" size={20} color="#9aa6a1" />
        </TouchableOpacity>
      ) : (
        <MaterialIcons name="chevron-right" size={22} color="#9aa6a1" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2ebe7',
    borderRadius: 18,
    padding: 12,
    paddingHorizontal: 14,
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#cce8e1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00504a',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#171d1b',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  metaText: {
    fontSize: 12,
    color: '#3f4946',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#9aa6a1',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pillText: {
    fontSize: 12,
    color: '#3f4946',
  },
  coords: {
    fontSize: 11,
    color: '#006a60',
  },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
