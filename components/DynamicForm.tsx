import { Fragment, memo, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FieldDef, FormSection, PhotoItem } from '../types';
import { GpsStatus } from '../store/formStore';
import { isFieldFilled, isFieldVisible } from '../utils/formLogic';
import TextField from './fields/TextField';
import TextAreaField from './fields/TextAreaField';
import SelectField from './fields/SelectField';
import RatingField from './fields/RatingField';
import ImageField from './fields/ImageField';
import GpsField from './fields/GpsField';
import BooleanField from './fields/BooleanField';
import DateField from './fields/DateField';

type Props = {
  fields: FieldDef[];
  sections?: FormSection[];
  draft: Record<string, any>;
  showErrors: boolean;
  onFieldChange: (id: string, value: any) => void;
  onAddPhotoPress: () => void;
  gpsStatus?: GpsStatus;
  onGpsCapture?: () => void;
};

function DynamicForm({
  fields,
  sections = [],
  draft,
  showErrors,
  onFieldChange,
  onAddPhotoPress,
  gpsStatus = 'idle',
  onGpsCapture,
}: Props) {
  const sectionById = useMemo(
    () => Object.fromEntries(sections.map((s) => [s.id, s])),
    [sections],
  );

  // Keep a ref to the latest onFieldChange so cached per-field callbacks
  // below never go stale, without needing to invalidate the cache when
  // onFieldChange's identity changes.
  const onFieldChangeRef = useRef(onFieldChange);
  useEffect(() => {
    onFieldChangeRef.current = onFieldChange;
  }, [onFieldChange]);

  // Stable per-field-id onChange callbacks so memo() on field components
  // isn't defeated by a fresh closure every render.
  const fieldChangeHandlers = useRef<Record<string, (v: any) => void>>({});
  const getFieldChangeHandler = useMemo(
    () => (id: string) => {
      if (!fieldChangeHandlers.current[id]) {
        fieldChangeHandlers.current[id] = (v: any) => onFieldChangeRef.current(id, v);
      }
      return fieldChangeHandlers.current[id];
    },
    [],
  );

  // Determine, for each field, whether it should show its section header —
  // built with reduce instead of a `let` mutated inside `.map()`.
  const rows = useMemo(() => {
    return fields.reduce<{ field: FieldDef; showHeader: boolean }[]>((acc, field) => {
      const prevSectionId = acc.length > 0 ? acc[acc.length - 1].field.sectionId : undefined;
      const showHeader = !!field.sectionId && field.sectionId !== prevSectionId;
      acc.push({ field, showHeader });
      return acc;
    }, []);
  }, [fields]);

  return (
    <View style={{ gap: 20 }}>
      {rows.map(({ field, showHeader }) => {
        if (!isFieldVisible(field, draft)) return null;

        const section = showHeader ? sectionById[field.sectionId!] : undefined;

        const value = draft[field.id];
        const error = showErrors && !!field.required && !isFieldFilled(field, value);

        return (
          <Fragment key={field.id}>
            {section && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
            )}
            {renderField(field, value, error, {
              getFieldChangeHandler,
              onAddPhotoPress,
              gpsStatus,
              onGpsCapture,
            })}
          </Fragment>
        );
      })}
    </View>
  );
}

export default memo(DynamicForm);

function renderField(
  field: FieldDef,
  value: any,
  error: boolean,
  ctx: {
    getFieldChangeHandler: (id: string) => (value: any) => void;
    onAddPhotoPress: () => void;
    gpsStatus: GpsStatus;
    onGpsCapture?: () => void;
  },
) {
  switch (field.type) {
    case 'text':
      return (
        <TextField
          field={field}
          value={value ?? ''}
          onChange={ctx.getFieldChangeHandler(field.id)}
          error={error}
        />
      );
    case 'number':
      return (
        <TextField
          field={field}
          value={value ?? ''}
          onChange={ctx.getFieldChangeHandler(field.id)}
          error={error}
          numeric
        />
      );
    case 'textarea':
      return (
        <TextAreaField
          field={field}
          value={value ?? ''}
          onChange={ctx.getFieldChangeHandler(field.id)}
          error={error}
        />
      );
    case 'select':
      return (
        <SelectField
          field={field}
          value={value ?? (field.multiple ? [] : '')}
          onChange={ctx.getFieldChangeHandler(field.id)}
          error={error}
        />
      );
    case 'rating':
      return (
        <RatingField
          field={field}
          value={value ?? 0}
          onChange={ctx.getFieldChangeHandler(field.id)}
          error={error}
        />
      );
    case 'image':
      return (
        <ImageField
          field={field}
          value={value ?? []}
          onChange={ctx.getFieldChangeHandler(field.id) as (v: PhotoItem[]) => void}
          onAddPress={ctx.onAddPhotoPress}
        />
      );
    case 'boolean':
      return (
        <BooleanField
          field={field}
          value={value ?? false}
          onChange={ctx.getFieldChangeHandler(field.id)}
          error={error}
        />
      );
    case 'date':
      return (
        <DateField
          field={field}
          value={value ?? ''}
          onChange={ctx.getFieldChangeHandler(field.id)}
          error={error}
        />
      );
    case 'gps': {
      const loc = value;
      const lat = Number(loc?.lat);
      const lng = Number(loc?.lng);
      const acc = Number(loc?.accuracy);
      const coords = loc && Number.isFinite(lat) && Number.isFinite(lng)
        ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        : '';
      const accuracy = loc && typeof loc.accuracy === 'number' && Number.isFinite(acc) ? `±${acc.toFixed(1)} m` : '';
      return (
        <GpsField
          status={ctx.gpsStatus}
          coords={coords}
          accuracy={accuracy}
          onCapture={ctx.onGpsCapture ?? (() => {})}
          error={error}
        />
      );
    }
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginTop: 4,
    marginBottom: -8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#dde8e3',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#006a60',
  },
});
