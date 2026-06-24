# Form Builder UI — Spec

## Purpose

The Collector app (separate React Native/Expo project) lets field surveyors fill out
dynamic forms. Forms are defined by a JSON `FormConfig` document. Today the only way
to create one is to hand-write that JSON, which is error-prone and not something a
non-technical user can do.

This spec describes a **standalone form-builder UI** (web or app — implementer's
choice) whose only job is: let a user visually construct a form, and export/import a
`FormConfig` JSON document that is byte-compatible with what Collector consumes. The
builder does not need to know about Collector's storage, sync, or entry-filling UI —
only about producing/editing valid `FormConfig` JSON.

**Treat this spec as the source of truth for the JSON contract.** The builder must
produce JSON that satisfies every rule in "Validation rules" below, since that's
exactly what Collector's own loader (`validateFormConfig`) will check on import.

## Output contract: `FormConfig`

```ts
type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'rating'
  | 'image'
  | 'gps'
  | 'date';

type ShowIfCondition = {
  fieldId: string;          // must reference another field's id in the same form
  equals: string | string[]; // field is shown if that field's value matches one of these
};

type FieldDef = {
  id: string;                // unique within the form, stable (used as storage key)
  label: string;             // user-facing question text
  type: FieldType;
  required?: boolean;
  placeholder?: string;      // text/textarea/number
  options?: string[];        // select only — required, non-empty
  max?: number;              // rating only — positive number, default UI assumes 5
  multiple?: boolean;        // select (checkbox-style) / image (multi-photo)
  auto?: boolean;            // date/gps — auto-fill with current value when entry created
  allowOther?: boolean;      // select only — adds a free-text "Other" option
  sectionId?: string;        // must reference a FormSection.id declared below
  showIf?: ShowIfCondition;  // conditional visibility
};

type FormSection = {
  id: string;
  title: string;
};

type FormConfig = {
  formId: string;       // stable identifier across versions of "the same form"
  formTitle: string;    // display name
  version: string;      // free-form version string, e.g. "1.0", "2.1"
  sections?: FormSection[];
  fields: FieldDef[];
};
```

### Validation rules (must hold for export to be accepted by Collector)

1. `formId`, `formTitle`, and `fields` are required at the top level.
2. `fields` must be a non-empty array.
3. Every field needs a non-empty `id` (string) and `label` (string).
4. `type` must be one of the nine `FieldType` values above.
5. Field `id`s must be unique within the form.
6. `type: 'select'` fields must have a non-empty `options` array.
7. `type: 'rating'` fields, if `max` is set, must have `max` be a positive number.
8. If a field has `showIf`, its `fieldId` must match the `id` of another field in the
   same form.
9. If a field has `sectionId`, it must match the `id` of a section declared in
   `sections`.

The builder should validate against these rules live (inline errors) — not just at
export time — and refuse to export until they pass.

### Field-type reference (for the builder's editor panel)

| Type | Relevant extra props | Notes |
|---|---|---|
| `text` | `placeholder` | single-line input |
| `textarea` | `placeholder` | multi-line input |
| `number` | `placeholder` | numeric input |
| `select` | `options` (required), `multiple`, `allowOther` | `multiple` = checkboxes, else radio/dropdown; `allowOther` adds free-text "Other" |
| `boolean` | — | yes/no toggle |
| `rating` | `max` | star/numeric rating, 1..max |
| `image` | `multiple` | photo capture/upload, single or multi |
| `gps` | `auto` | device location; `auto` = capture automatically on entry creation |
| `date` | `auto` | date picker; `auto` = default to today on entry creation |

All field types support: `required`, `sectionId`, `showIf`.

### Sections

Sections are an optional grouping/display mechanism. A field with no `sectionId`
renders in the default/ungrouped area. Order of `sections` array and order of
`fields` array both matter for display order — the builder should let the user
reorder both via drag-and-drop.

### Conditional visibility (`showIf`)

A field with `showIf: { fieldId, equals }` is only shown when the referenced field's
current value matches `equals` (a single value or any value in an array). This is
how the example "category" field below drives entirely different sub-sections
depending on the selected category. The builder must let a user pick the trigger
field from a dropdown of *already-defined* fields (to satisfy validation rule 8) and
pick/type the matching value(s).

## Example: a real-world form this builder must be able to produce

This is an actual form used in production (abbreviated field list, full version
has ~20 fields across 4 conditional sections):

```json
{
  "formId": "template-001",
  "formTitle": "Template",
  "version": "2.0",
  "sections": [
    { "id": "sec-building", "title": "Building" },
    { "id": "sec-public", "title": "Public space" }
  ],
  "fields": [
    { "id": "location", "label": "GPS location", "type": "gps", "required": true, "auto": false },
    { "id": "surveyDate", "label": "Survey date", "type": "date", "required": true, "auto": true },
    { "id": "category", "label": "Category", "type": "select", "required": true,
      "options": ["Building", "Public space"] },
    { "id": "buildingFloors", "label": "Number of floors", "type": "number",
      "sectionId": "sec-building", "showIf": { "fieldId": "category", "equals": "Building" } },
    { "id": "publicSpaceLit", "label": "Adequately lit at night", "type": "boolean",
      "sectionId": "sec-public", "showIf": { "fieldId": "category", "equals": "Public space" } },
    { "id": "issues", "label": "Issues observed", "type": "select", "multiple": true,
      "allowOther": true, "options": ["Vandalism", "Flooding", "Structural damage"] },
    { "id": "photos", "label": "Site photos", "type": "image", "multiple": true }
  ]
}
```

A correct builder lets a non-technical user assemble exactly this — add fields, set
their type and options, group two of them under a "Building" section conditioned on
`category == "Building"` — entirely through forms/clicks, never touching raw JSON.

## Required builder features (MVP)

1. **Form metadata editor** — `formTitle`, `formId` (auto-slugify from title, but
   editable), `version`.
2. **Field list editor** — add/remove/reorder fields (drag-and-drop), each field
   expandable to edit its type-specific properties per the table above.
3. **Section editor** — add/remove/reorder sections; assign a field to a section via
   dropdown.
4. **Conditional visibility editor** — per field, optionally pick a trigger field +
   matching value(s) from existing fields/their options.
5. **Live validation** — surface every rule violation above inline, block export
   while any exist.
6. **JSON export** — produce the exact `FormConfig` shape, pretty-printed.
7. **JSON import** — load an existing `FormConfig` (e.g. the example above) back into
   the visual editor for further editing. This is the round-trip guarantee: anything
   exported must re-import losslessly.
8. **Live preview** (nice-to-have but recommended) — render what the form will
   roughly look like to an end user, including conditional show/hide behavior, so the
   form author can sanity-check without leaving the builder.

## Modularity & future expansion

The spec and the builder's internals should both be designed so that **adding a new
field type, a new field property, or a new top-level concept later does not require
restructuring existing code**:

- **Field type registry, not a switch statement.** Each field type (`text`,
  `select`, `gps`, etc.) should be implemented as a self-contained module
  registered in a table: `{ type, label, editorComponent, defaultProps,
  validate(field) }`. Adding `type: 'signature'` later means adding one new
  registry entry, not touching every place `type` is branched on.
- **Property panel driven by the registry**, not hardcoded per type — the editor for
  a field's extra props (`options`, `max`, `multiple`, ...) should be rendered from
  what the registered type declares it needs, so new types automatically get a
  working (if generic) editor without UI changes.
- **Validation rules colocated with the type/feature they belong to** (e.g. the
  "select needs non-empty options" rule lives with the `select` type module), so the
  global validator is just "run every registered field's `validate()`" plus the
  handful of form-level rules (unique ids, showIf/sectionId references). New types
  bring their own validation; they don't require editing a central validator
  function.
- **`FormConfig` itself should be treated as versioned and extensible** — unknown
  top-level keys or unknown field properties encountered on import should be
  preserved (round-tripped) rather than silently dropped, so a future Collector
  version can add e.g. a `repeatable` field property or a `formDescription` top-level
  field without breaking older builder versions that don't know about it yet.
- **Export/import should go through one serialization module**, not be scattered —
  so the on-disk JSON shape can evolve (e.g. wrapping in a `{ schemaVersion, ...
  }` envelope someday) by changing one place.
- Sections, conditional logic, and field-list ordering are themselves implemented as
  independent concerns (not entangled with any specific field type), so they keep
  working unchanged as new field types are added.

## Non-goals

- This builder does not need Supabase/auth/sync — it's a pure JSON-in, JSON-out tool.
- It does not need to replicate Collector's actual entry-filling renderer pixel for
  pixel; a reasonable approximation for the live preview is enough.
- No need to support importing arbitrary non-`FormConfig` JSON — only this schema.
