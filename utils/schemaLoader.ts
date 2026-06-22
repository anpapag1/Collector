import { File } from 'expo-file-system';
import { FormConfig, FieldType } from '../types';

const VALID_FIELD_TYPES: FieldType[] = [
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

export function loadBundledConfig(): FormConfig {
  return require('../assets/form-config.json') as FormConfig;
}

export async function loadFromPath(uri: string): Promise<FormConfig> {
  const content = await new File(uri).text();
  const parsed = JSON.parse(content);
  if (!parsed.formId || !parsed.formTitle || !parsed.fields) {
    throw new Error('Invalid form-config: missing formId, formTitle, or fields');
  }
  if (!Array.isArray(parsed.fields)) {
    throw new Error('Invalid form-config: fields must be an array');
  }
  for (const field of parsed.fields) {
    if (!field || typeof field.id !== 'string' || field.id.trim().length === 0) {
      throw new Error('Invalid form-config: each field must have a non-empty string id');
    }
    if (typeof field.label !== 'string' || field.label.trim().length === 0) {
      throw new Error(`Invalid form-config: field "${field.id}" must have a non-empty string label`);
    }
    if (!VALID_FIELD_TYPES.includes(field.type)) {
      throw new Error(`Invalid form-config: field "${field.id}" has unknown type "${field.type}"`);
    }
  }
  return parsed as FormConfig;
}
