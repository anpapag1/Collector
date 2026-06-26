import { EntryData, FieldDef, OtherValue, SelectValue } from '../types';

export function isOtherValue(v: any): v is OtherValue {
  return !!v && typeof v === 'object' && v.value === 'Other';
}

export function selectValueLabel(v: SelectValue): string {
  return isOtherValue(v) ? `Other: ${v.otherText}` : String(v);
}

// A field is visible when it has no showIf, or when the referenced field's
// current draft value matches the condition.
export function isFieldVisible(field: FieldDef, draft: EntryData): boolean {
  if (!field.showIf) return true;
  const target = draft[field.showIf.fieldId];
  const expected = field.showIf.equals;
  const expectedList = Array.isArray(expected) ? expected : [expected];

  // Type-tolerant compare: the builder always writes `equals` as a string, but
  // the trigger's draft value can be a boolean or number. Coerce both sides to
  // strings so e.g. boolean `true` matches `'true'` and number `5` matches `'5'`,
  // while string-vs-string (select) comparisons still work as before.
  const matches = (a: unknown) => expectedList.some((e) => String(a) === String(e));

  if (Array.isArray(target)) {
    return target.some((t) => matches(isOtherValue(t) ? t.value : t));
  }
  const actual = isOtherValue(target) ? target.value : target;
  return matches(actual);
}

export function isFieldFilled(field: FieldDef, value: any): boolean {
  if (field.type === 'boolean') return value === true || value === false;
  if (field.type === 'gps') return !!value;
  if (field.type === 'rating') return typeof value === 'number' && value > 0;
  if (field.type === 'image') return true;
  if (field.type === 'select' && field.multiple) {
    if (!Array.isArray(value) || value.length === 0) return false;
    return value.every((v) => (isOtherValue(v) ? v.otherText.trim().length > 0 : true));
  }
  if (field.type === 'select' && isOtherValue(value)) return value.otherText.trim().length > 0;
  return !!value && String(value).trim().length > 0;
}
