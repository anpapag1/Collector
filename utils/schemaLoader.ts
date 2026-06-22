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

function validateFormConfig(parsed: any): FormConfig {
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
    if (field.type === 'select' && (!Array.isArray(field.options) || field.options.length === 0)) {
      throw new Error(`Invalid form-config: field "${field.id}" is type "select" but has no non-empty options array`);
    }
    if (field.type === 'rating' && field.max !== undefined && (typeof field.max !== 'number' || field.max <= 0)) {
      throw new Error(`Invalid form-config: field "${field.id}" is type "rating" but has an invalid max (must be a positive number)`);
    }
  }
  return parsed as FormConfig;
}

export function loadBundledConfig(): FormConfig {
  const parsed = require('../assets/form-config.json');
  return validateFormConfig(parsed);
}

export async function loadFromPath(uri: string): Promise<FormConfig> {
  const content = await new File(uri).text();
  const parsed = JSON.parse(content);
  return validateFormConfig(parsed);
}
