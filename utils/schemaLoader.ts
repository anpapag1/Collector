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
  const seenIds = new Set<string>();
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
    if (seenIds.has(field.id)) {
      throw new Error(`Invalid form-config: field "${field.id}" has a duplicate id (field ids must be unique within a config)`);
    }
    seenIds.add(field.id);
  }
  for (const field of parsed.fields) {
    if (field.showIf && !seenIds.has(field.showIf.fieldId)) {
      throw new Error(`Invalid form-config: field "${field.id}" has showIf.fieldId "${field.showIf.fieldId}" which does not match any field id in this config`);
    }
    if (field.sectionId !== undefined) {
      const sectionIds = Array.isArray(parsed.sections) ? parsed.sections.map((s: any) => s && s.id) : [];
      if (!sectionIds.includes(field.sectionId)) {
        throw new Error(`Invalid form-config: field "${field.id}" has sectionId "${field.sectionId}" which does not match any section id in this config`);
      }
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
