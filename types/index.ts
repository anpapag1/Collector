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

export type PhotoItem = {
  id: string;
  uri: string;
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
