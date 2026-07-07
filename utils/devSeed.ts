import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { EntryData, FieldDef, FormConfig, PhotoItem } from '../types';
import { usePickerStore } from '../store/pickerStore';
import { useEntriesStore } from '../store/entriesStore';
import { useAuthStore } from '../store/authStore';

export const DEV_TEST_ENTRY_COUNT = 100;

// One field of every type the form builder supports, so this form exercises
// every component in components/fields/* — used to stress-test rendering,
// export, and sync with realistic (if fake) volume.
export const DEV_TEST_FORM: FormConfig = {
  formId: 'dev-test-form',
  formTitle: 'Dev Test Form',
  version: '1.0',
  fields: [
    { id: 'text_field', label: 'Text field', type: 'text', placeholder: 'Enter text' },
    { id: 'textarea_field', label: 'Textarea field', type: 'textarea', placeholder: 'Enter notes' },
    { id: 'number_field', label: 'Number field', type: 'number', placeholder: '0' },
    {
      id: 'select_field',
      label: 'Select field',
      type: 'select',
      options: ['Option A', 'Option B', 'Option C'],
      allowOther: true,
    },
    { id: 'boolean_field', label: 'Boolean field', type: 'boolean' },
    { id: 'rating_field', label: 'Rating field', type: 'rating', max: 5 },
    { id: 'image_field', label: 'Image field', type: 'image', multiple: true },
    { id: 'gps_field', label: 'GPS field', type: 'gps' },
    { id: 'date_field', label: 'Date field', type: 'date' },
  ],
};

const SAMPLE_WORDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function randomSentence(seed: number): string {
  const len = 6 + (seed % 8);
  const words: string[] = [];
  for (let i = 0; i < len; i++) words.push(pick(SAMPLE_WORDS, seed + i));
  return words.join(' ') + '.';
}

// Copies the bundled assets/template.jpg into a fresh per-entry file, the
// same way app/collect.tsx copies a picked/captured photo into
// Paths.document — so seeded entries have a real local photo, not a
// reference into the app bundle.
async function copyTemplatePhoto(id: string): Promise<PhotoItem> {
  const asset = Asset.fromModule(require('../assets/template.jpg'));
  await asset.downloadAsync();
  const source = new File(asset.localUri ?? asset.uri);
  const dest = new File(Paths.document, `${id}.jpg`);
  source.copySync(dest);
  return { id, uri: dest.uri };
}

function buildEntryData(index: number): Promise<EntryData> {
  const seed = index + 1;
  const photoId = `dev-photo-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
  const daysAgo = seed % 30;
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  return copyTemplatePhoto(photoId).then((photo) => ({
    text_field: `Test entry ${seed} — ${pick(SAMPLE_WORDS, seed)}`,
    textarea_field: randomSentence(seed),
    number_field: seed * 3 - 1,
    select_field:
      seed % 4 === 0
        ? { value: 'Other', otherText: `Custom value ${seed}` }
        : pick(['Option A', 'Option B', 'Option C'], seed),
    boolean_field: seed % 2 === 0,
    rating_field: (seed % 5) + 1,
    image_field: [photo],
    gps_field: {
      lat: 37.9838 + (seed % 100) * 0.001,
      lng: 23.7275 + (seed % 100) * 0.001,
      accuracy: 5 + (seed % 20),
    },
    date_field: date.toISOString(),
  }));
}

// Adds the DEV_TEST_FORM as a custom form and seeds it with 100 entries, one
// per field type, each with its own copy of assets/template.jpg. Local-only
// by default (no userId) so it doesn't get pushed to Supabase unless the
// developer is signed in.
export async function seedDevTestData(
  count: number = DEV_TEST_ENTRY_COUNT
): Promise<{ formTitle: string; entryCount: number }> {
  const userId = useAuthStore.getState().user?.id ?? null;
  const importId = `dev-test-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;

  usePickerStore.getState().addCustomForm(DEV_TEST_FORM, importId, userId);

  for (let i = 0; i < count; i++) {
    const data = await buildEntryData(i);
    const createdAt = Date.now() - (count - i) * 1000;
    useEntriesStore.getState().addEntry(data, DEV_TEST_FORM.fields, DEV_TEST_FORM.formTitle, createdAt, importId);
  }

  return { formTitle: DEV_TEST_FORM.formTitle, entryCount: count };
}
