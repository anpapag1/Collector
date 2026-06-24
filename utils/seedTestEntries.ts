import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { useEntriesStore } from '../store/entriesStore';
import { validateFormConfig } from './schemaLoader';
import { EntryData, PhotoItem } from '../types';

type SeedRecord = { data: EntryData; createdAt: number };

// Copies the bundled app icon into the same local document directory real
// photos live in, once, so every seeded entry can reference it as a normal
// local PhotoItem — same file is fine reused across all 100 entries, the
// point is exercising the photo-bearing code paths (display, sync upload,
// export), not 100 distinct images.
async function getSeedPhotoUri(): Promise<string> {
  const dest = new File(Paths.document, 'seed-test-photo.jpg');
  if (!dest.exists) {
    const asset = Asset.fromModule(require('../assets/icon.png'));
    await asset.downloadAsync();
    new File(asset.localUri!).copy(dest);
  }
  return dest.uri;
}

// Dev-only stress-test helper: injects 100 pre-built entries shaped to the
// Erwtimatologio Simiou form, going through the same addEntry path real
// collection uses (so sync/export/display behave identically, no special
// "fake data" code path anywhere else in the app).
export async function seedTestEntries(): Promise<number> {
  const schema = validateFormConfig(require('../assets/Erwtimatologio_simiou.json'));
  const records = require('../assets/test-entries-erwtimatologio.json') as SeedRecord[];
  const photoUri = await getSeedPhotoUri();

  const { addEntry } = useEntriesStore.getState();
  records.forEach((record, index) => {
    const photo: PhotoItem = { id: `seed-photo-${index}`, uri: photoUri };
    const data = { ...record.data, photos: [photo] };
    addEntry(data, schema.fields, schema.formTitle, record.createdAt);
  });
  return records.length;
}
