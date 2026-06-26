import {
  createEmptyBuilderState,
  deserializeFormConfig,
  serializeFormConfig,
  validateFormConfigForSave,
} from '../formBuilderSerializer';
import { validateFormConfig } from '../schemaLoader';
import { FormConfig } from '../../types';

function baseState() {
  const state = createEmptyBuilderState();
  state.formId = 'form-001';
  state.formTitle = 'Test Form';
  state.version = '1.0';
  state.fields = [
    { id: 'name', label: 'Name', type: 'text' },
    { id: 'choice', label: 'Choice', type: 'select', options: ['A', 'B'] },
  ];
  return state;
}

describe('validateFormConfigForSave', () => {
  it('is valid for a complete builder state', () => {
    const { valid, errors } = validateFormConfigForSave(baseState());
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
  });

  it('reports form-level errors for missing formId/formTitle/fields', () => {
    const state = createEmptyBuilderState();
    const { valid, errors } = validateFormConfigForSave(state);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.scope === 'form' && /form ID/.test(e.message))).toBe(true);
    expect(errors.some((e) => e.scope === 'form' && /form name/.test(e.message))).toBe(true);
    expect(errors.some((e) => e.scope === 'form' && /at least one field/.test(e.message))).toBe(true);
  });

  it('reports a field-scoped error for a select field with no options', () => {
    const state = baseState();
    state.fields[1].options = [];
    const { valid, errors } = validateFormConfigForSave(state);
    expect(valid).toBe(false);
    expect(errors).toContainEqual(
      expect.objectContaining({ scope: 'field', id: 'choice' }),
    );
  });

  it('reports duplicate ids', () => {
    const state = baseState();
    state.fields[1].id = 'name';
    const { valid, errors } = validateFormConfigForSave(state);
    expect(valid).toBe(false);
    expect(errors.some((e) => /duplicate|used more than once/.test(e.message))).toBe(true);
  });

  it('reports a dangling showIf reference', () => {
    const state = baseState();
    state.fields[0].showIf = { fieldId: 'missing', equals: 'x' };
    const { valid, errors } = validateFormConfigForSave(state);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.id === 'name' && /conditional rule/.test(e.message))).toBe(true);
  });

  it('reports a dangling sectionId reference', () => {
    const state = baseState();
    state.fields[0].sectionId = 'missing-section';
    const { valid, errors } = validateFormConfigForSave(state);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.id === 'name' && /section that no longer exists/.test(e.message))).toBe(true);
  });
});

describe('serializeFormConfig / deserializeFormConfig round-trip', () => {
  it('omits empty optional keys and produces a config validateFormConfig accepts', () => {
    const config = serializeFormConfig(baseState());
    expect(config.sections).toBeUndefined();
    expect(config.fields[0]).not.toHaveProperty('required');
    expect(config.fields[0]).not.toHaveProperty('placeholder');
    expect(() => validateFormConfig(config)).not.toThrow();
  });

  it('round-trips a config with sections/showIf back into builder state and out again', () => {
    const original: FormConfig = {
      formId: 'survey',
      formTitle: 'Survey',
      version: '2.0',
      sections: [{ id: 'sec-a', title: 'Section A' }],
      fields: [
        { id: 'trigger', label: 'Trigger', type: 'boolean' },
        {
          id: 'detail',
          label: 'Detail',
          type: 'text',
          required: true,
          sectionId: 'sec-a',
          showIf: { fieldId: 'trigger', equals: 'true' },
        },
      ],
    };
    const state = deserializeFormConfig(original);
    const roundTripped = serializeFormConfig(state);
    expect(roundTripped).toEqual(original);
    expect(() => validateFormConfig(roundTripped)).not.toThrow();
  });
});
