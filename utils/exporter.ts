import * as FileSystem from 'expo-file-system/legacy';
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

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function exportFilename(formId: string): string {
  return `export-${formId}-${timestamp()}.zip`;
}

function csvExportFilename(formId: string): string {
  return `export-${formId}-${timestamp()}.csv`;
}

function imageFieldIdFor(entry: Entry, schema: FormConfig): string | undefined {
  // Entries with their own `fields` snapshot use it directly; legacy entries
  // (no snapshot) fall back to the hardcoded 'photo' key, matching
  // app/export.tsx's photoTotal calculation, so the summary count and the
  // actual archive contents agree.
  return entry.fields ? entry.fields.find((f) => f.type === 'image')?.id : 'photo';
}

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'uri' in item) {
          return String((item as PhotoItem).uri);
        }
        return csvValue(item);
      })
      .filter(Boolean)
      .join('; ');
  }
  if (typeof value === 'object') {
    if ('lat' in value && 'lng' in value) {
      const loc = value as { lat: number; lng: number; accuracy?: number | null };
      return `${loc.lat}, ${loc.lng}${loc.accuracy ? ` (accuracy ${loc.accuracy}m)` : ''}`;
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function csvFieldsFor(entries: Entry[], schema: FormConfig) {
  const seen = new Set<string>();
  const fields = [];

  for (const field of schema.fields) {
    if (seen.has(field.id)) continue;
    seen.add(field.id);
    fields.push(field);
  }

  for (const entry of entries) {
    for (const field of entry.fields ?? []) {
      if (seen.has(field.id)) continue;
      seen.add(field.id);
      fields.push(field);
    }
  }

  return fields;
}

export async function buildAndExport(
  entries: Entry[],
  schema: FormConfig,
  onProgress: (pct: number) => void
): Promise<{ path: string; skippedPhotos: number }> {
  const zip = new JSZip();
  const imgFolder = zip.folder('images');
  if (!imgFolder) throw new Error('Failed to create images folder in export zip');
  const filename = exportFilename(schema.formId);

  const totalPhotos = entries.reduce((sum, entry) => {
    const fieldId = imageFieldIdFor(entry, schema);
    const photos: PhotoItem[] = fieldId ? (entry.data[fieldId] ?? []) : [];
    return sum + photos.length;
  }, 0);

  let processedPhotos = 0;
  let skippedPhotos = 0;

  const serialised = await Promise.all(
    entries.map(async (entry) => {
      const fieldId = imageFieldIdFor(entry, schema);
      const photos: PhotoItem[] = fieldId ? (entry.data[fieldId] ?? []) : [];
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
        } catch {
          skippedPhotos++;
        }
        processedPhotos++;
        if (totalPhotos > 0) {
          onProgress(Math.round((processedPhotos / totalPhotos) * 60));
        }
      }

      const imageData = fieldId ? { [fieldId]: imagePaths } : {};
      return {
        id: entry.id,
        seq: entry.seq,
        createdAt: new Date(entry.createdAt).toISOString(),
        data: { ...flattenSelectValues(entry, schema), ...imageData },
      };
    })
  );

  onProgress(70);

  zip.file(
    'entries.json',
    JSON.stringify(
      {
        formId: schema.formId,
        formTitle: schema.formTitle,
        exportedAt: new Date().toISOString(),
        entries: serialised,
      },
      null,
      2
    )
  );

  onProgress(85);
  const zipBase64 = await zip.generateAsync({ type: 'base64' });
  onProgress(95);

  const outPath = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(outPath, zipBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress(100);
  return { path: outPath, skippedPhotos };
}

export async function buildCsvExport(
  entries: Entry[],
  schema: FormConfig,
  onProgress: (pct: number) => void
): Promise<{ path: string }> {
  const filename = csvExportFilename(schema.formId);
  const fields = csvFieldsFor(entries, schema);
  const headers = ['id', 'seq', 'createdAt', 'formTitle', ...fields.map((field) => field.label)];

  const rows = entries.map((entry, index) => {
    const data = flattenSelectValues(entry, schema);
    const row = [
      entry.id,
      entry.seq,
      new Date(entry.createdAt).toISOString(),
      entry.formTitle ?? schema.formTitle,
      ...fields.map((field) => csvValue(data[field.id])),
    ];
    onProgress(Math.round(((index + 1) / Math.max(entries.length, 1)) * 80));
    return row.map(csvEscape).join(',');
  });

  const csv = `\uFEFF${headers.map(csvEscape).join(',')}\r\n${rows.join('\r\n')}`;
  onProgress(90);

  const outPath = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(outPath, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  onProgress(100);
  return { path: outPath };
}

export { exportFilename, csvExportFilename };
