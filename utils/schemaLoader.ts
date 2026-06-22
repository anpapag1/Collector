import { FormConfig } from '../types';

export function loadBundledConfig(): FormConfig {
  return require('../assets/form-config.json') as FormConfig;
}

export async function loadFromPath(uri: string): Promise<FormConfig> {
  const content = await (await fetch(uri)).text();
  const parsed = JSON.parse(content);
  if (!parsed.formId || !parsed.formTitle || !parsed.fields) {
    throw new Error('Invalid form-config: missing formId, formTitle, or fields');
  }
  return parsed as FormConfig;
}
