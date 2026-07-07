export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'rating'
  | 'image'
  | 'gps'
  | 'date';

export type ShowIfCondition = {
  fieldId: string;
  equals: string | string[];
};

export type FieldDef = {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  max?: number;
  multiple?: boolean;
  auto?: boolean;
  allowOther?: boolean;
  sectionId?: string;
  showIf?: ShowIfCondition;
};

export type FormSection = {
  id: string;
  title: string;
};

export type FormConfig = {
  formId: string;
  formTitle: string;
  version: string;
  sections?: FormSection[];
  fields: FieldDef[];
};

export type GpsLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  address?: string | null;
};

// `uri` is set for a photo not yet uploaded (a local device file path, or —
// on native after sync — a rehydrated local file path). Once uploaded, the
// value stored in Postgres/passed down from admin-fetched data instead has
// `path` (its Supabase Storage key) with no `uri` at all; utils/photoUrls.ts
// resolves a displayable URL from that on demand. A given PhotoItem has
// at least one of the two, never neither.
export type PhotoItem = {
  id: string;
  uri?: string;
  path?: string;
};

// Stored shape for a select option that is the "Other" choice with free text.
export type OtherValue = {
  value: 'Other';
  otherText: string;
};

export type SelectValue = string | OtherValue;

export type EntryData = Record<string, any>;

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

export type Entry = {
  id: string;
  createdAt: number;
  formTitle?: string;
  fields?: FieldDef[];
  data: EntryData;

  // The CustomForm (store/pickerStore.ts) this entry was collected against,
  // by its local importId — set at creation time so the form's remoteId can
  // be resolved later even if the form hadn't synced yet when the entry was
  // created. Only meaningful for locally-created entries; entries pulled
  // from the server already know formRemoteId directly (see below) and
  // don't need this.
  formImportId?: string | null;
  // The owning form's `forms.id` (Supabase primary key) — entry-photos
  // Storage objects are keyed by this (not by user) so admin ownership
  // reassignment never has to move files. Populated once the form has
  // synced; until then it's resolved on demand from formImportId at push
  // time (see services/syncEngine.ts's resolveEntryFormId).
  formRemoteId?: string | null;

  userId?: string | null;
  syncStatus: SyncStatus;
  syncingSince?: number | null;
  remoteId?: string | null;
  // The remote row's `updated_at` as of the last successful push or pull —
  // distinct from `updatedAt` (which bumps on every local change, synced or
  // not). Lets the sync engine tell "I haven't seen this change yet" apart
  // from "I made this change", which is what makes conflict detection work.
  remoteUpdatedAt?: number | null;
  updatedAt: number;
  syncError?: string | null;
  syncAttempts?: number;
};
