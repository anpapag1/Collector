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
  seq: number;
  createdAt: number;
  formTitle?: string;
  fields?: FieldDef[];
  data: EntryData;

  userId?: string | null;
  syncStatus: SyncStatus;
  syncingSince?: number | null;
  remoteId?: string | null;
  updatedAt: number;
  syncError?: string | null;
  syncAttempts?: number;
};
