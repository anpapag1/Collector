import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef, FieldType } from '../types';

export type FieldTypeMeta = {
  type: FieldType;
  label: string;
  color: string;
  bg: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  defaultProps: Partial<FieldDef>;
  // Per-type validation, mirroring Collector-Web's field-registry.js validate().
  // Generic checks (id/label/type/duplicate ids/showIf/sectionId refs) live in
  // formBuilderSerializer.ts; this only covers type-specific extra props.
  validate: (field: FieldDef) => string[];
};

export const FIELD_TYPE_ORDER: FieldType[] = [
  'text',
  'textarea',
  'number',
  'select',
  'boolean',
  'rating',
  'image',
  'gps',
  'date',
];

export const FIELD_REGISTRY: Record<FieldType, FieldTypeMeta> = {
  text: {
    type: 'text',
    label: 'Short text answer',
    color: '#2589C8',
    bg: '#EBF4FC',
    icon: 'short-text',
    defaultProps: { placeholder: '' },
    validate: () => [],
  },
  textarea: {
    type: 'textarea',
    label: 'Long text answer',
    color: '#6366F1',
    bg: '#EEF2FF',
    icon: 'notes',
    defaultProps: { placeholder: '' },
    validate: () => [],
  },
  number: {
    type: 'number',
    label: 'Number',
    color: '#0E9E9B',
    bg: '#CCFBF1',
    icon: 'tag',
    defaultProps: { placeholder: '' },
    validate: () => [],
  },
  select: {
    type: 'select',
    label: 'Choose from a list',
    color: '#D97706',
    bg: '#FEF3C7',
    icon: 'check-box',
    defaultProps: { options: [], multiple: false, allowOther: false },
    validate: (field) => {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        return [`"${field.label || 'This field'}" needs at least one choice.`];
      }
      return [];
    },
  },
  boolean: {
    type: 'boolean',
    label: 'Yes / No',
    color: '#16A34A',
    bg: '#DCFCE7',
    icon: 'toggle-on',
    defaultProps: {},
    validate: () => [],
  },
  rating: {
    type: 'rating',
    label: 'Rating',
    color: '#B45309',
    bg: '#FEF9C3',
    icon: 'star',
    defaultProps: { max: 5 },
    validate: (field) => {
      if (field.max !== undefined && (typeof field.max !== 'number' || field.max <= 0)) {
        return [`"${field.label || 'This field'}" rating max must be a positive number.`];
      }
      return [];
    },
  },
  image: {
    type: 'image',
    label: 'Photo',
    color: '#9333EA',
    bg: '#F3E8FF',
    icon: 'photo-camera',
    defaultProps: { multiple: false },
    validate: () => [],
  },
  gps: {
    type: 'gps',
    label: 'Location',
    color: '#DC2626',
    bg: '#FEE2E2',
    icon: 'place',
    defaultProps: { auto: false },
    validate: () => [],
  },
  date: {
    type: 'date',
    label: 'Date',
    color: '#0891B2',
    bg: '#CFFAFE',
    icon: 'event',
    defaultProps: { auto: false },
    validate: () => [],
  },
};

export function createBlankField(type: FieldType, id: string): FieldDef {
  return {
    id,
    label: '',
    type,
    required: false,
    ...FIELD_REGISTRY[type].defaultProps,
  };
}
