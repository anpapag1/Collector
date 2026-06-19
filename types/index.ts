export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'rating'
  | 'image'
  | 'gps'
  | 'date'
  | 'time';

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
};

export type FormConfig = {
  formId: string;
  formTitle: string;
  version: string;
  fields: FieldDef[];
};

export type GpsLocation = {
  lat: number;
  lng: number;
  accuracy: number;
};

export type PhotoItem = {
  id: string;
  uri: string;
};

export type EntryData = Record<string, any>;

export type Entry = {
  id: string;
  seq: number;
  createdAt: number;
  data: EntryData;
};
