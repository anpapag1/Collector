import { validateFormConfig } from '../schemaLoader';

function baseConfig(overrides: Record<string, any> = {}) {
  return {
    formId: 'form-001',
    formTitle: 'Test Form',
    version: '1.0',
    sections: [{ id: 'sec-a', title: 'Section A' }],
    fields: [
      { id: 'name', label: 'Name', type: 'text' },
      { id: 'age', label: 'Age', type: 'number' },
      {
        id: 'flavor',
        label: 'Flavor',
        type: 'select',
        options: ['Vanilla', 'Chocolate'],
      },
      { id: 'satisfaction', label: 'Satisfaction', type: 'rating', max: 5 },
      {
        id: 'comments',
        label: 'Comments',
        type: 'textarea',
        sectionId: 'sec-a',
        showIf: { fieldId: 'name', equals: 'foo' },
      },
    ],
    ...overrides,
  };
}

describe('validateFormConfig', () => {
  it('accepts a valid, complete form config and returns it unchanged', () => {
    const config = baseConfig();
    const result = validateFormConfig(config);
    expect(result).toBe(config);
    expect(result).toEqual(config);
  });

  it('throws when formId is missing', () => {
    const config: any = baseConfig();
    delete config.formId;
    expect(() => validateFormConfig(config)).toThrow(/missing formId/);
  });

  it('throws when formTitle is missing', () => {
    const config: any = baseConfig();
    delete config.formTitle;
    expect(() => validateFormConfig(config)).toThrow(/missing formId/);
  });

  it('throws when fields is missing', () => {
    const config: any = baseConfig();
    delete config.fields;
    expect(() => validateFormConfig(config)).toThrow(/missing formId/);
  });

  it('throws when fields is not an array', () => {
    const config: any = baseConfig({ fields: { not: 'an array' } });
    expect(() => validateFormConfig(config)).toThrow(/fields must be an array/);
  });

  it('throws when a field is missing id', () => {
    const config: any = baseConfig({
      fields: [{ label: 'No id', type: 'text' }],
    });
    expect(() => validateFormConfig(config)).toThrow(/non-empty string id/);
  });

  it('throws when a field has an empty-string id', () => {
    const config: any = baseConfig({
      fields: [{ id: '   ', label: 'Empty id', type: 'text' }],
    });
    expect(() => validateFormConfig(config)).toThrow(/non-empty string id/);
  });

  it('throws when a field is missing label', () => {
    const config: any = baseConfig({
      fields: [{ id: 'f1', type: 'text' }],
    });
    expect(() => validateFormConfig(config)).toThrow(/non-empty string label/);
  });

  it('throws when a field has an empty-string label', () => {
    const config: any = baseConfig({
      fields: [{ id: 'f1', label: '   ', type: 'text' }],
    });
    expect(() => validateFormConfig(config)).toThrow(/non-empty string label/);
  });

  it('throws when a field has an invalid/unknown type', () => {
    const config: any = baseConfig({
      fields: [{ id: 'f1', label: 'Bad type', type: 'video' }],
    });
    expect(() => validateFormConfig(config)).toThrow(/unknown type/);
  });

  it('throws when a select field has no options', () => {
    const config: any = baseConfig({
      fields: [{ id: 'f1', label: 'Select', type: 'select' }],
    });
    expect(() => validateFormConfig(config)).toThrow(/no non-empty options array/);
  });

  it('throws when a select field has an empty options array', () => {
    const config: any = baseConfig({
      fields: [{ id: 'f1', label: 'Select', type: 'select', options: [] }],
    });
    expect(() => validateFormConfig(config)).toThrow(/no non-empty options array/);
  });

  it('throws when a rating field has max = 0', () => {
    const config: any = baseConfig({
      fields: [{ id: 'f1', label: 'Rating', type: 'rating', max: 0 }],
    });
    expect(() => validateFormConfig(config)).toThrow(/invalid max/);
  });

  it('throws when a rating field has a negative max', () => {
    const config: any = baseConfig({
      fields: [{ id: 'f1', label: 'Rating', type: 'rating', max: -3 }],
    });
    expect(() => validateFormConfig(config)).toThrow(/invalid max/);
  });

  it('throws when a rating field has a non-number max', () => {
    const config: any = baseConfig({
      fields: [{ id: 'f1', label: 'Rating', type: 'rating', max: '5' }],
    });
    expect(() => validateFormConfig(config)).toThrow(/invalid max/);
  });

  it('throws on duplicate field ids', () => {
    const config: any = baseConfig({
      fields: [
        { id: 'dup', label: 'First', type: 'text' },
        { id: 'dup', label: 'Second', type: 'text' },
      ],
    });
    expect(() => validateFormConfig(config)).toThrow(/duplicate id/);
  });

  it('throws when showIf.fieldId references a non-existent field', () => {
    const config: any = baseConfig({
      fields: [
        { id: 'f1', label: 'Field 1', type: 'text' },
        {
          id: 'f2',
          label: 'Field 2',
          type: 'text',
          showIf: { fieldId: 'does-not-exist', equals: 'x' },
        },
      ],
    });
    expect(() => validateFormConfig(config)).toThrow(/does not match any field id/);
  });

  it('throws when sectionId references a non-existent section', () => {
    const config: any = baseConfig({
      sections: [{ id: 'sec-a', title: 'Section A' }],
      fields: [
        { id: 'f1', label: 'Field 1', type: 'text', sectionId: 'sec-missing' },
      ],
    });
    expect(() => validateFormConfig(config)).toThrow(/does not match any section id/);
  });

  it('throws when sectionId is used but no sections array exists', () => {
    const config: any = baseConfig({
      sections: undefined,
      fields: [
        { id: 'f1', label: 'Field 1', type: 'text', sectionId: 'sec-a' },
      ],
    });
    expect(() => validateFormConfig(config)).toThrow(/does not match any section id/);
  });
});
