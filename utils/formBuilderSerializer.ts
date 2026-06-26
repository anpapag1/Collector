import { FieldDef, FieldType, FormConfig, FormSection } from '../types';
import { FIELD_REGISTRY, FIELD_TYPE_ORDER } from './fieldRegistry';

export type BuilderState = {
  formId: string;
  formTitle: string;
  version: string;
  description: string;
  sections: FormSection[];
  fields: FieldDef[];
};

export type BuilderError = {
  scope: 'form' | 'field';
  id: string | null;
  message: string;
};

export function createEmptyBuilderState(): BuilderState {
  return {
    formId: '',
    formTitle: '',
    version: '1.0',
    description: '',
    sections: [],
    fields: [],
  };
}

export function deserializeFormConfig(config: FormConfig): BuilderState {
  return {
    formId: config.formId ?? '',
    formTitle: config.formTitle ?? '',
    version: config.version ?? '1.0',
    description: '',
    sections: Array.isArray(config.sections)
      ? config.sections.map((s) => ({ id: s.id, title: s.title }))
      : [],
    fields: Array.isArray(config.fields) ? config.fields.map((f) => ({ ...f })) : [],
  };
}

// Mirrors Collector-Web's serializeFormConfig: omit falsy/empty optional keys
// so exported JSON stays minimal and round-trips cleanly with the web app.
export function serializeFormConfig(state: BuilderState): FormConfig {
  const fields: FieldDef[] = state.fields.map((field) => {
    const out: FieldDef = {
      id: field.id,
      label: field.label,
      type: field.type,
    };
    if (field.required) out.required = true;
    if (field.placeholder) out.placeholder = field.placeholder;
    if (Array.isArray(field.options) && field.options.length > 0) out.options = field.options;
    if (field.max !== undefined && field.max !== null) out.max = field.max;
    if (field.multiple) out.multiple = true;
    if (field.auto) out.auto = true;
    if (field.allowOther) out.allowOther = true;
    if (field.sectionId) out.sectionId = field.sectionId;
    if (field.showIf) out.showIf = field.showIf;
    return out;
  });

  const config: FormConfig = {
    formId: state.formId,
    formTitle: state.formTitle,
    version: state.version,
    fields,
  };
  if (state.sections.length > 0) {
    config.sections = state.sections.map((s) => ({ id: s.id, title: s.title }));
  }
  return config;
}

// Per-field/per-form scoped validation, mirroring Collector-Web's
// validateFormConfigForSave. Reuses FIELD_REGISTRY[type].validate() for
// type-specific extra-prop checks (the single source of truth shared with
// utils/schemaLoader.ts's generic structural rules).
export function validateFormConfigForSave(state: BuilderState): {
  valid: boolean;
  errors: BuilderError[];
} {
  const errors: BuilderError[] = [];

  if (!state.formId.trim()) errors.push({ scope: 'form', id: null, message: 'Add a form ID.' });
  if (!state.formTitle.trim()) errors.push({ scope: 'form', id: null, message: 'Add a form name.' });
  if (state.fields.length === 0) {
    errors.push({ scope: 'form', id: null, message: 'Add at least one field.' });
  }

  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const field of state.fields) {
    if (field.id) {
      if (seenIds.has(field.id)) duplicateIds.add(field.id);
      seenIds.add(field.id);
    }
  }

  const sectionIds = new Set(state.sections.map((s) => s.id));

  for (const field of state.fields) {
    if (!field.id || !field.label.trim()) {
      errors.push({ scope: 'field', id: field.id || null, message: 'Every field needs a label.' });
    }
    if (!FIELD_TYPE_ORDER.includes(field.type as FieldType)) {
      errors.push({
        scope: 'field',
        id: field.id || null,
        message: `"${field.label || 'This field'}" has an unknown field type.`,
      });
      continue;
    }
    if (field.id && duplicateIds.has(field.id)) {
      errors.push({
        scope: 'field',
        id: field.id,
        message: `Field id "${field.id}" is used more than once — ids must be unique.`,
      });
    }

    for (const msg of FIELD_REGISTRY[field.type].validate(field)) {
      errors.push({ scope: 'field', id: field.id || null, message: msg });
    }

    if (field.showIf) {
      const eq = field.showIf.equals;
      const isEmptyEquals = Array.isArray(eq)
        ? eq.length === 0 || eq.every((v) => String(v).trim() === '')
        : String(eq ?? '').trim() === '';
      if (isEmptyEquals) {
        errors.push({
          scope: 'field',
          id: field.id || null,
          message: `"${field.label || 'This field'}"'s conditional rule needs a value to match.`,
        });
      }
    }
    if (field.showIf && !seenIds.has(field.showIf.fieldId)) {
      errors.push({
        scope: 'field',
        id: field.id || null,
        message: `"${field.label || 'This field'}"'s conditional rule references a field that no longer exists.`,
      });
    }
    if (field.sectionId && !sectionIds.has(field.sectionId)) {
      errors.push({
        scope: 'field',
        id: field.id || null,
        message: `"${field.label || 'This field'}" is assigned to a section that no longer exists.`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateFieldId(label: string, existingIds: Set<string>): string {
  const base = slugify(label) || 'field';
  let candidate = base;
  let n = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export function generateSectionId(title: string, existingIds: Set<string>): string {
  const base = slugify(title) || 'section';
  let candidate = base;
  let n = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}
