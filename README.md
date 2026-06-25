# Collector

Collector is an offline-first mobile app (built with Expo / React Native) for collecting field data using custom forms — with photo capture, GPS location, and one-tap export.

No backend, no login, no internet connection required. Everything is stored on the device until you're ready to export and share it.

## What it does

1. **Pick a form** — use the bundled template or import your own custom form (JSON file).
2. **Fill it in** — answer the form's fields: text, numbers, ratings, photos, GPS, dates, etc. Required fields are validated; in-progress entries are auto-saved as drafts.
3. **Review entries** — browse every entry you've collected, newest first, fully offline.
4. **Export & share** — bundle all entries and their photos into a single ZIP file and share it through the native share sheet (email, chat, drive, etc.).

## Screens

| Screen | What it does |
|---|---|
| Home | Total entry count, your 3 most recent entries, active form selector, button to start a new entry. |
| New Entry | Dynamic form rendered from the active form's schema. Auto-captures GPS and date for fields marked `auto: true`. |
| All Entries | Full list of everything collected; swipe to delete, tap to view details. |
| Entry Detail | Read-only view of one entry's data, photos, location, and metadata. |
| Export | Builds a ZIP (`entries.json` + an `images/` folder) and opens the share sheet. |
| Form Picker | Switch between the bundled template and any custom forms you've imported; import, save, or delete forms. |

## Tech stack

- **Expo 56** / **React Native 0.85** / **React 19**, TypeScript
- **Expo Router** for navigation
- **Zustand** (with `persist` + AsyncStorage) for offline-first state
- **Expo Location**, **Expo Image Picker**, **Expo Document Picker**, **Expo File System**, **Expo Sharing**
- **JSZip** for client-side export

## Getting started

```bash
npm install
npm start          # expo start
npm run android    # expo run:android
npm run ios        # expo run:ios
```

> Expo SDK has changed significantly — see [AGENTS.md](AGENTS.md) before writing code, and check the versioned docs at https://docs.expo.dev/versions/v56.0.0/.

## Creating your own forms

Collector can load any form that follows its form-config schema. See [docs/form_creation_instructions.md](docs/form_creation_instructions.md) for the full guide on building and importing a custom form.
