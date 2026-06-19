import * as FileSystem from 'expo-file-system';
import { FormConfig } from '../types';

export function loadBundledConfig(): FormConfig {
  return require('../assets/form-config.json') as FormConfig;
}

export async function loadFromPath(uri: string): Promise<FormConfig> {
  const content = await FileSystem.readAsStringAsync(uri);
  const parsed = JSON.parse(content);
  if (!parsed.formId || !parsed.fields) {
    throw new Error('Invalid form-config: missing formId or fields');
  }
  return parsed as FormConfig;
}
