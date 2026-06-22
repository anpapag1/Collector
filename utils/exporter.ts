import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { Entry, FormConfig, PhotoItem } from '../types';
import { selectValueLabel } from './formLogic';

// Flattens "Other: <text>" select values (and arrays of them) into plain
// strings so exports stay readable instead of dumping raw objects.
function flattenSelectValues(entry: Entry, schema: FormConfig): Record<string, any> {
  const fields = entry.fields ?? schema.fields;
  const flattened: Record<string, any> = { ...entry.data };

  for (const field of fields) {
    if (field.type !== 'select') continue;
    const v = flattened[field.id];
    if (v === undefined || v === null) continue;
    flattened[field.id] = Array.isArray(v) ? v.map(selectValueLabel).join(', ') : selectValueLabel(v);
  }

  return flattened;
}

function exportFilename(formId: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `export-${formId}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}

export async function buildAndExport(
  entries: Entry[],
  schema: FormConfig,
  onProgress: (pct: number) => void
): Promise<string> {
  const zip = new JSZip();
  const imgFolder = zip.folder('images')!;
  const filename = exportFilename(schema.formId);

  // Build serialisable entries with relative image paths
  let photoTotal = 0;
  const serialised = await Promise.all(
    entries.map(async (entry) => {
      const photos: PhotoItem[] = entry.data.photo ?? [];
      const imagePaths: string[] = [];

      for (let i = 0; i < photos.length; i++) {
        const ph = photos[i];
        const imgName = `${entry.id}_photo_${i}.jpg`;
        try {
          const b64 = await FileSystem.readAsStringAsync(ph.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imgFolder.file(imgName, b64, { base64: true });
          imagePaths.push(`images/${imgName}`);
          photoTotal++;
        } catch {
          // skip unreadable photo
        }
        onProgress(Math.round(((photoTotal + 1) / (photos.length + 1)) * 60));
      }

      return {
        id: entry.id,
        seq: entry.seq,
        createdAt: new Date(entry.createdAt).toISOString(),
        data: { ...flattenSelectValues(entry, schema), photo: imagePaths },
      };
    })
  );

  onProgress(70);

  const entriesJson = JSON.stringify(
    {
      formId: schema.formId,
      formTitle: schema.formTitle,
      exportedAt: new Date().toISOString(),
      entries: serialised,
    },
    null,
    2
  );
  zip.file('entries.json', entriesJson);

  onProgress(85);

  const zipBase64 = await zip.generateAsync({ type: 'base64' });

  onProgress(95);

  const outPath = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(outPath, zipBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress(100);

  return outPath;
}

export { exportFilename };
