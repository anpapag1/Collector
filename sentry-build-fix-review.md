# Code Review: fix/eas-sentry-build-failure

## Problem

EAS Android build `b3550cf9-fc2d-4aa7-acaf-cca8607f37af` failed with `EAS_BUILD_UNKNOWN_GRADLE_ERROR`. The actual failure was in the `createBundleReleaseJsAndAssets_SentryUpload_com.anonymous.Collector@1.0.0+1_1` Gradle task:

```
error: An organization ID or slug is required (provide with --org)
...
Execution failed for task ':app:createBundleReleaseJsAndAssets_SentryUpload_com.anonymous.Collector@1.0.0+1_1'.
> Process 'command '.../node_modules/@sentry/cli/bin/sentry-cli'' finished with non-zero exit value 1
```

## Root cause

- [app.json](app.json:38) registers the `@sentry/react-native/expo` config plugin with no options (`"@sentry/react-native/expo"` as a bare string), so no `organization`/`project` are baked into `sentry.properties`.
- `@sentry/react-native`'s plugin (`node_modules/@sentry/react-native/plugin/build/withSentry.js`) falls back to the `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` env vars at build time when those aren't set in config.
- Those env vars are not defined as EAS secrets/build env, so `sentry-cli` has nothing to upload against and exits non-zero, failing the whole Gradle build.
- Sentry isn't actually active in the app yet — `EXPO_PUBLIC_SENTRY_DSN` in [.env](.env) is empty — so the upload step has no useful purpose right now.

## Fix

Added a `base` build profile in [eas.json](eas.json:6-11) setting `SENTRY_DISABLE_AUTO_UPLOAD=true`, which `sentry.gradle` (`node_modules/@sentry/react-native/sentry.gradle:11`) checks to skip the upload task entirely. `internal` and `production` profiles now `extends: "base"` to pick this up.

```diff
   "build": {
+    "base": {
+      "env": {
+        "SENTRY_DISABLE_AUTO_UPLOAD": "true"
+      }
+    },
     "internal": {
+      "extends": "base",
       "android": { "buildType": "apk", "distribution": "internal" }
     },
     "production": {
+      "extends": "base",
       "android": { "buildType": "app-bundle", "autoIncrement": true }
     }
   },
```

## Why this approach over alternatives

- **Configuring `organization`/`project` in the plugin instead:** would require a real Sentry org/project to exist and `SENTRY_AUTH_TOKEN` to be set as an EAS secret. Premature since Sentry isn't wired up (empty DSN) — would just trade one missing-credential failure for another.
- **Removing the Sentry plugin/dependency entirely:** more invasive than necessary; keeps future Sentry setup (just flip the env var off and add org/project) a one-line change instead of re-adding the integration from scratch.

## Risk / follow-up

- No functional risk: this only disables a CI-time source-map upload step, not any runtime Sentry behavior (which is already inert due to the empty DSN).
- Follow-up when Sentry is actually configured: remove `SENTRY_DISABLE_AUTO_UPLOAD` from eas.json and pass `organization`/`project` to the `@sentry/react-native/expo` plugin in app.json, plus add `SENTRY_AUTH_TOKEN` as an EAS secret.

## Verification plan

- [ ] Trigger a new EAS Android `internal` build and confirm the Gradle build completes past the previously-failing Sentry upload task.
- [ ] Confirm app behavior is unaffected (no Sentry usage observed either way, since DSN is empty).
