import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { Image } from 'react-native';
import { Entry, FieldDef, FormConfig, PhotoItem } from '../types';
import { selectValueLabel } from './formLogic';
import { getEntryDisplayNumbers } from './entryNumbering';

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

function imageFieldIdsFor(entry: Entry): string[] {
  // Entries with their own `fields` snapshot use it directly (a form can have
  // more than one image-type field); legacy entries (no snapshot) fall back
  // to the hardcoded 'photo' key, matching app/export.tsx's photoTotal
  // calculation, so the summary count and the actual archive contents agree.
  return entry.fields
    ? entry.fields.filter((f) => f.type === 'image').map((f) => f.id)
    : ['photo'];
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
    const fieldIds = imageFieldIdsFor(entry);
    return sum + fieldIds.reduce((s, fieldId) => s + (entry.data[fieldId]?.length ?? 0), 0);
  }, 0);

  let processedPhotos = 0;
  let skippedPhotos = 0;

  const displayNumbers = getEntryDisplayNumbers(entries);

  const serialised = await Promise.all(
    entries.map(async (entry) => {
      const fieldIds = imageFieldIdsFor(entry);
      const imageData: Record<string, string[]> = {};

      for (const fieldId of fieldIds) {
        const photos: PhotoItem[] = entry.data[fieldId] ?? [];
        const imagePaths: string[] = [];

        for (let i = 0; i < photos.length; i++) {
          const ph = photos[i];
          const imgName = `${entry.id}_${fieldId}_photo_${i}.jpg`;
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

        imageData[fieldId] = imagePaths;
      }

      return {
        id: entry.id,
        seq: displayNumbers.get(entry.id) ?? 0,
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
  const displayNumbers = getEntryDisplayNumbers(entries);

  const rows = entries.map((entry, index) => {
    const data = flattenSelectValues(entry, schema);
    const row = [
      entry.id,
      displayNumbers.get(entry.id) ?? 0,
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

export { exportFilename, csvExportFilename, xlsxExportFilename };

// ── XLSX export ───────────────────────────────────────────────────────────────

function xlsxExportFilename(formId: string): string {
  return `export-${formId}-${timestamp()}.xlsx`;
}

function excelColumnName(index: number): string {
  let name = '';
  let i = index;
  do {
    name = String.fromCharCode(65 + (i % 26)) + name;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return name;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function xlsxCell(colIdx: number, rowIdx: number, value: string, style = 2): string {
  const ref = `${excelColumnName(colIdx)}${rowIdx}`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function xlsxDate(ts: number | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function xlsxFieldValue(field: FieldDef, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (field.type === 'image') return '';
  if (field.type === 'gps') {
    const gps = value as any;
    const lat = Number(gps?.lat ?? gps?.latitude);
    const lng = Number(gps?.lng ?? gps?.longitude);
    if (isNaN(lat) || isNaN(lng)) return '';
    const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    return gps?.address ? `${gps.address}\n${coords}` : coords;
  }
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), () => resolve({ width: 1200, height: 900 }));
  });
}

export async function buildXlsxExport(
  entries: Entry[],
  schema: FormConfig,
  onProgress: (pct: number) => void
): Promise<{ path: string; skippedPhotos: number }> {
  const zip = new JSZip();
  const fields = schema.fields;
  const headers = ['ID', 'Created', 'Updated', 'Form', ...fields.map((f) => f.label)];
  const imageFields = fields
    .map((field, index) => ({ field, columnIndex: index + 4 }))
    .filter(({ field }) => field.type === 'image');

  const totalPhotos = entries.reduce((sum, entry) => {
    const fieldIds = imageFieldIdsFor(entry);
    return sum + fieldIds.reduce((s, fid) => s + ((entry.data[fid] as any[])?.length ?? 0), 0);
  }, 0);

  type MediaItem = { b64: string; extension: string; relationshipId: string; mediaIndex: number; dispW: number; dispH: number };
  const media: MediaItem[] = [];
  const anchors: string[] = [];
  const rowHeights = new Map<number, number>();
  let processedPhotos = 0;
  let skippedPhotos = 0;

  const dataRows: string[] = [];

  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex];
    const sheetRow = entryIndex + 2;
    let tallestImageRows = 0;

    for (const { field, columnIndex } of imageFields) {
      const photos: PhotoItem[] = entry.data[field.id] ?? [];
      tallestImageRows = Math.max(tallestImageRows, Math.ceil(photos.length / 2));

      for (let pi = 0; pi < photos.length; pi++) {
        const ph = photos[pi];
        try {
          const b64 = await FileSystem.readAsStringAsync(ph.uri, { encoding: FileSystem.EncodingType.Base64 });
          const { width: imgW, height: imgH } = await getImageSize(ph.uri);
          const ext = ph.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
          const mediaIndex = media.length + 1;
          const MAX_W = 112, MAX_H = 76;
          const scale = Math.min(MAX_W / imgW, MAX_H / imgH);
          const dispW = Math.max(24, Math.round(imgW * scale));
          const dispH = Math.max(24, Math.round(imgH * scale));
          const slotCol = pi % 2;
          const slotRow = Math.floor(pi / 2);
          const xOff = 7 + slotCol * 122 + Math.round((MAX_W - dispW) / 2);
          const yOff = 7 + slotRow * 86 + Math.round((MAX_H - dispH) / 2);

          media.push({ b64, extension: ext, relationshipId: `rId${mediaIndex}`, mediaIndex, dispW, dispH });
          anchors.push(
            `<xdr:oneCellAnchor>` +
            `<xdr:from><xdr:col>${columnIndex}</xdr:col><xdr:colOff>${xOff * 9525}</xdr:colOff><xdr:row>${sheetRow - 1}</xdr:row><xdr:rowOff>${yOff * 9525}</xdr:rowOff></xdr:from>` +
            `<xdr:ext cx="${dispW * 9525}" cy="${dispH * 9525}"/>` +
            `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${mediaIndex}" name="Photo ${mediaIndex}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
            `<xdr:blipFill><a:blip r:embed="${`rId${mediaIndex}`}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
            `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${dispW * 9525}" cy="${dispH * 9525}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
            `<xdr:clientData/></xdr:oneCellAnchor>`
          );
        } catch {
          skippedPhotos++;
        }
        processedPhotos++;
        if (totalPhotos > 0) onProgress(Math.round((processedPhotos / totalPhotos) * 65));
      }
    }

    const hasGps = fields.some((f) => f.type === 'gps' && entry.data[f.id]?.lat);
    rowHeights.set(sheetRow, tallestImageRows ? Math.max(54, tallestImageRows * 66) : hasGps ? 36 : 24);

    const flat = flattenSelectValues(entry, schema);
    const values = [
      entry.id,
      xlsxDate(entry.createdAt),
      xlsxDate(entry.updatedAt),
      entry.formTitle ?? schema.formTitle,
      ...fields.map((f) => xlsxFieldValue(f, flat[f.id])),
    ];
    const cells = values.map((v, ci) => xlsxCell(ci, sheetRow, String(v), ci < 4 ? 2 : 3)).join('');
    dataRows.push(`<row r="${sheetRow}" ht="${rowHeights.get(sheetRow)}" customHeight="1">${cells}</row>`);
  }

  onProgress(75);

  const lastCol = excelColumnName(headers.length - 1);
  const totalRows = Math.max(1, entries.length + 1);
  const headerCells = headers.map((h, i) => xlsxCell(i, 1, h, 1)).join('');
  const colDefs = headers.map((h, i) => {
    const f = fields[i - 4];
    const w = i === 0 ? 36 : i < 4 ? 20 : f?.type === 'image' || f?.type === 'gps' ? 34 : Math.min(36, Math.max(14, h.length + 5));
    return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
  }).join('');

  const hasPng  = media.some((m) => m.extension === 'png');
  const hasJpeg = media.some((m) => m.extension === 'jpeg');

  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    (hasPng  ? `<Default Extension="png" ContentType="image/png"/>` : '') +
    (hasJpeg ? `<Default Extension="jpeg" ContentType="image/jpeg"/>` : '') +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    (media.length ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : '') +
    `</Types>`
  );

  zip.file('_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`
  );

  zip.file('xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Entries" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );

  zip.file('xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`
  );

  zip.file('xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2589C8"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="4">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  );

  zip.file('xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${lastCol}${totalRows}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/>` +
    `<cols>${colDefs}</cols>` +
    `<sheetData><row r="1" ht="24" customHeight="1">${headerCells}</row>${dataRows.join('')}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${totalRows}"/>` +
    (media.length ? `<drawing r:id="rId1"/>` : '') +
    `</worksheet>`
  );

  if (media.length) {
    zip.file('xl/worksheets/_rels/sheet1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
      `</Relationships>`
    );
    zip.file('xl/drawings/drawing1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      anchors.join('') +
      `</xdr:wsDr>`
    );
    zip.file('xl/drawings/_rels/drawing1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      media.map((m) => `<Relationship Id="${m.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${m.mediaIndex}.${m.extension}"/>`).join('') +
      `</Relationships>`
    );
    media.forEach((m) => zip.file(`xl/media/image${m.mediaIndex}.${m.extension}`, m.b64, { base64: true }));
  }

  onProgress(90);
  const xlsxBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  onProgress(97);

  const outPath = (FileSystem.cacheDirectory ?? '') + xlsxExportFilename(schema.formId);
  await FileSystem.writeAsStringAsync(outPath, xlsxBase64, { encoding: FileSystem.EncodingType.Base64 });

  onProgress(100);
  return { path: outPath, skippedPhotos };
}
