# Creating a Custom Form for Collector

A form in Collector is a single JSON file describing a title, optional sections, and a list of fields. You can build one from scratch or copy [`assets/form-config.json`](assets/form-config.json) as a starting point.

Once your file is ready, import it from the **Home** screen via the form picker's import option (document picker), or save/export an existing form the same way.

## Top-level structure

```json
{
  "formId": "my-form-001",
  "formTitle": "My Form",
  "version": "1.0",
  "sections": [
    { "id": "sec-a", "title": "Section A" }
  ],
  "fields": [ /* see below */ ]
}
```

| Key | Type | Required | Notes |
|---|---|---|---|
| `formId` | string | yes | Unique identifier for the form. |
| `formTitle` | string | yes | Display name shown in the app. |
| `version` | string | yes | Free-form version label, e.g. `"1.0"`. |
| `sections` | array | no | Groups of fields shown together (see [Sections](#sections-and-conditional-fields)). |
| `fields` | array | yes | The list of fields that make up the form. |

## Field definitions

Each entry in `fields` is an object:

```json
{
  "id": "fieldId",
  "label": "Question shown to the user",
  "type": "text",
  "required": false,
  "placeholder": "Optional hint text",
  "options": ["A", "B", "C"],
  "max": 5,
  "multiple": false,
  "auto": false,
  "allowOther": false,
  "sectionId": "sec-a",
  "showIf": { "fieldId": "otherFieldId", "equals": "SomeValue" }
}
```

| Key | Type | Used by | Description |
|---|---|---|---|
| `id` | string | all | Unique field key — this is also the key used in exported data. |
| `label` | string | all | The question/label shown to the user. |
| `type` | string | all | One of the field types below. |
| `required` | boolean | all | If `true`, the entry can't be submitted without a value. |
| `placeholder` | string | text, textarea, number | Hint text shown inside an empty field. |
| `options` | string[] | select | The list of choices. |
| `max` | number | rating | Maximum rating value (e.g. `5` for a 5-star rating). |
| `multiple` | boolean | select, image | For `select`: allow choosing more than one option. For `image`: allow attaching more than one photo. |
| `auto` | boolean | gps, date | If `true`, the value is captured automatically when the entry starts (GPS has a 20s timeout; falls back to manual capture). |
| `allowOther` | boolean | select | Adds an "Other" choice with a free-text field. |
| `sectionId` | string | any | Groups the field under a section defined in `sections`. |
| `showIf` | object | any | Conditionally shows the field — see below. |

### Field types

| Type | Renders as | Notes |
|---|---|---|
| `text` | Single-line text input | |
| `textarea` | Multi-line text input | |
| `number` | Numeric input | |
| `select` | Choice list | Use `options`; add `multiple: true` for multi-select, `allowOther: true` to allow a custom answer. |
| `boolean` | Yes/No toggle | |
| `rating` | Star rating | Use `max` to set the number of stars (defaults if omitted). |
| `image` | Camera/library photo picker | Use `multiple: true` to allow several photos. Photos are bundled into the export's `images/` folder. |
| `gps` | Location capture | Captures latitude, longitude, and accuracy. Set `auto: true` to capture it automatically when the entry opens. |
| `date` | Date picker | Set `auto: true` to pre-fill with the current date. |

## Sections and conditional fields

**Sections** group related fields under a heading. Define them at the top level:

```json
"sections": [
  { "id": "sec-building", "title": "Building" },
  { "id": "sec-other", "title": "Other" }
]
```

Then tag a field with `"sectionId": "sec-building"` to place it in that group.

**Conditional fields** (`showIf`) only appear when another field has a specific value:

```json
"showIf": { "fieldId": "category", "equals": "Building" }
```

`equals` can be a single string or an array of strings (the field shows if the target field's value matches any of them):

```json
"showIf": { "fieldId": "category", "equals": ["Building", "Mixed use"] }
```

This is typically combined with `sectionId` so an entire section only appears for a given category — see the building/public-space/parking examples in `assets/form-config.json`.

## Worked example

A minimal form with a required category, a conditional follow-up field, and a photo field:

```json
{
  "formId": "site-check-001",
  "formTitle": "Site Check",
  "version": "1.0",
  "sections": [
    { "id": "sec-building", "title": "Building details" }
  ],
  "fields": [
    {
      "id": "location",
      "label": "GPS location",
      "type": "gps",
      "required": true,
      "auto": true
    },
    {
      "id": "category",
      "label": "Category",
      "type": "select",
      "required": true,
      "options": ["Building", "Public space", "Other"]
    },
    {
      "id": "buildingFloors",
      "label": "Number of floors",
      "type": "number",
      "required": false,
      "sectionId": "sec-building",
      "showIf": { "fieldId": "category", "equals": "Building" }
    },
    {
      "id": "photos",
      "label": "Site photos",
      "type": "image",
      "required": false,
      "multiple": true
    },
    {
      "id": "notes",
      "label": "Notes",
      "type": "textarea",
      "required": false,
      "placeholder": "Any additional observations…"
    }
  ]
}
```

## Checklist before importing

- [ ] `formId` and `formTitle` are set and `formId` is unique.
- [ ] Every field has a unique `id` — this id becomes the key in exported data.
- [ ] `select` fields have a non-empty `options` array.
- [ ] Any `showIf.fieldId` actually refers to a field that exists earlier in the form (typically a `select`).
- [ ] Any `sectionId` used on a field matches an `id` in `sections`.
- [ ] The file is valid JSON (no trailing commas, double-quoted keys).
