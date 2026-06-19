import { View } from 'react-native';
import { FieldDef, PhotoItem } from '../types';
import TextField from './fields/TextField';
import TextAreaField from './fields/TextAreaField';
import SelectField from './fields/SelectField';
import RatingField from './fields/RatingField';
import ImageField from './fields/ImageField';

type Props = {
  fields: FieldDef[];
  draft: Record<string, any>;
  showErrors: boolean;
  onFieldChange: (id: string, value: any) => void;
  onAddPhotoPress: () => void;
};

export default function DynamicForm({
  fields,
  draft,
  showErrors,
  onFieldChange,
  onAddPhotoPress,
}: Props) {
  return (
    <View style={{ gap: 20 }}>
      {fields
        .filter((f) => f.type !== 'gps')
        .map((field) => {
          const value = draft[field.id];
          const error = showErrors && !!field.required && !isFieldFilled(field, value);

          switch (field.type) {
            case 'text':
              return (
                <TextField
                  key={field.id}
                  field={field}
                  value={value ?? ''}
                  onChange={(v) => onFieldChange(field.id, v)}
                  error={error}
                />
              );
            case 'textarea':
              return (
                <TextAreaField
                  key={field.id}
                  field={field}
                  value={value ?? ''}
                  onChange={(v) => onFieldChange(field.id, v)}
                  error={error}
                />
              );
            case 'select':
              return (
                <SelectField
                  key={field.id}
                  field={field}
                  value={value ?? ''}
                  onChange={(v) => onFieldChange(field.id, v)}
                  error={error}
                />
              );
            case 'rating':
              return (
                <RatingField
                  key={field.id}
                  field={field}
                  value={value ?? 0}
                  onChange={(v) => onFieldChange(field.id, v)}
                  error={error}
                />
              );
            case 'image':
              return (
                <ImageField
                  key={field.id}
                  field={field}
                  value={value ?? []}
                  onChange={(v) => onFieldChange(field.id, v)}
                  onAddPress={onAddPhotoPress}
                />
              );
            default:
              return null;
          }
        })}
    </View>
  );
}

function isFieldFilled(field: FieldDef, value: any): boolean {
  if (field.type === 'rating') return typeof value === 'number' && value > 0;
  if (field.type === 'image') return true; // not required in default config
  return !!value && String(value).trim().length > 0;
}
