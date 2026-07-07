import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { StorageAccessFramework, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { usePickerStore } from '../store/pickerStore';
import { useAuthStore } from '../store/authStore';
import { useFormStore } from '../store/formStore';
import { useFormDraftStore } from '../store/formDraftStore';
import { loadFromPath, validateFormConfig } from '../utils/schemaLoader';
import {
  BuilderState,
  buildAIPrompt,
  createEmptyBuilderState,
  deserializeFormConfig,
  generateFieldId,
  generateSectionId,
  serializeFormConfig,
  slugify,
  validateFormConfigForSave,
} from '../utils/formBuilderSerializer';
import { createBlankField, FIELD_REGISTRY, FIELD_TYPE_ORDER } from '../utils/fieldRegistry';
import { FORM_TEMPLATES } from '../utils/formTemplates';
import { FieldDef, FieldType } from '../types';
import FieldEditorRow from '../components/formBuilder/FieldEditorRow';
import SectionsPanel from '../components/formBuilder/SectionsPanel';
import Toast from '../components/Toast';
import { AppColors } from '../theme/colors';
import { useAppColors, useThemedStyles } from '../theme/useAppColors';

export default function FormBuilderScreen() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const session = useAuthStore((s) => s.session);
  const addCustomForm = usePickerStore((s) => s.addCustomForm);
  const setActivePresetId = usePickerStore((s) => s.setActivePresetId);
  const loadSchema = useFormStore((s) => s.loadSchema);

  // "Copy & edit" (web dashboard forms grid): the grid already has the full
  // FormConfig for any visible form in hand (its own, or — in admin mode —
  // another user's, which never lives in the local pickerStore), and hands
  // it over via this transient store rather than a route param. Seeded with
  // a blank id/"(copy)" title so saving inserts a new form instead of
  // updating the original — mirrors Collector-Web's dashboard.js:1811-1826
  // copy-edit button exactly.
  const [duplicateSeed] = useState(() => useFormDraftStore.getState().takeDuplicateSeed());
  const { template } = useLocalSearchParams<{ template?: string }>();

  const [state, setState] = useState<BuilderState>(() => {
    if (duplicateSeed) {
      return deserializeFormConfig({
        ...duplicateSeed,
        formId: `${slugify(duplicateSeed.formTitle)}-copy-${Math.random().toString(36).slice(2, 8)}`,
        formTitle: `${duplicateSeed.formTitle} (copy)`,
      });
    }
    if (template === 'blank') {
      return createEmptyBuilderState();
    }
    if (template) {
      const tmpl = FORM_TEMPLATES.find((t) => t.key === template);
      if (tmpl) return deserializeFormConfig(tmpl.schema);
    }
    return createEmptyBuilderState();
  });
  // Shown once, for a genuinely brand-new form (not a duplicate) — lets the
  // user start blank or from a template instead of always starting empty.
  // Mirrors Collector-Web's "Choose a template" dropdown on Create form.
  const [showTemplatePicker, setShowTemplatePicker] = useState(!duplicateSeed && !template);
  const [metaExpanded, setMetaExpanded] = useState(true);
  const [sectionsExpanded, setSectionsExpanded] = useState(false);
  const [expandedFieldIds, setExpandedFieldIds] = useState<Set<string>>(new Set());
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [showFormErrors, setShowFormErrors] = useState(false);
  const [slugSuffix] = useState(() => Math.random().toString(36).slice(2, 8));

  const pickTemplate = (schema: (typeof FORM_TEMPLATES)[number]['schema'] | null) => {
    if (schema) setState(deserializeFormConfig(schema));
    setShowTemplatePicker(false);
  };

  const { valid, errors } = useMemo(() => validateFormConfigForSave(state), [state]);
  const formErrors = useMemo(
    () => errors.filter((e) => e.scope === 'form' || (e.scope === 'field' && e.id == null)),
    [errors],
  );
  const fieldErrorsById = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of errors) {
      if (e.scope === 'field' && e.id != null) {
        map.set(e.id, [...(map.get(e.id) ?? []), e.message]);
      }
    }
    return map;
  }, [errors]);

  const updateField = (index: number, updated: FieldDef) => {
    setState((s) => {
      const fields = [...s.fields];
      fields[index] = updated;
      return { ...s, fields };
    });
  };

  const addField = (type: FieldType = 'text') => {
    const existingIds = new Set(state.fields.map((f) => f.id));
    const id = generateFieldId(`field-${state.fields.length + 1}`, existingIds);
    const field = createBlankField(type, id);
    setState((s) => ({ ...s, fields: [...s.fields, field] }));
    setExpandedFieldIds((prev) => new Set(prev).add(id));
  };

  const removeField = (index: number) => {
    setState((s) => {
      const removedId = s.fields[index]?.id;
      const fields = s.fields
        .filter((_, i) => i !== index)
        // Scrub any other field's conditional rule that pointed at the deleted
        // field so no dangling showIf reference is left behind.
        .map((f) => (removedId && f.showIf?.fieldId === removedId ? { ...f, showIf: undefined } : f));
      return { ...s, fields };
    });
  };

  // When sections change (e.g. one is deleted in SectionsPanel), clear the
  // sectionId of any field whose section no longer exists so we never ship a
  // dangling reference.
  const handleSectionsChange = (sections: typeof state.sections) => {
    setState((s) => {
      const sectionIds = new Set(sections.map((sec) => sec.id));
      const fields = s.fields.map((f) =>
        f.sectionId && !sectionIds.has(f.sectionId) ? { ...f, sectionId: undefined } : f,
      );
      return { ...s, sections, fields };
    });
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setState((s) => {
      const fields = [...s.fields];
      const target = index + dir;
      if (target < 0 || target >= fields.length) return s;
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...s, fields };
    });
  };

  const toggleFieldExpanded = (id: string) => {
    setExpandedFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAll = () => setExpandedFieldIds(new Set());
  const expandAll = () => setExpandedFieldIds(new Set(state.fields.map((f) => f.id)));

  // Auto-assign an id from the label when the label input blurs, mirroring the
  // web builder's behavior. Doing it on blur (not on every keystroke) keeps the
  // field.id stable while the user is typing so the component key never changes
  // mid-edit — which previously caused the expanded row to collapse on the first
  // character typed.
  const handleFieldLabelBlur = (index: number) => {
    const field = state.fields[index];
    if (!field || !field.id.startsWith('field-') || !field.label.trim()) return;

    const existingIds = new Set(state.fields.filter((_, i) => i !== index).map((f) => f.id));
    const newId = generateFieldId(field.label, existingIds);
    if (newId === field.id) return;

    const oldId = field.id;
    setState((s) => {
      const cur = s.fields[index];
      if (!cur || cur.id !== oldId) return s; // guard: field moved or removed
      return {
        ...s,
        fields: s.fields.map((f, i) => {
          if (i === index) return { ...f, id: newId };
          // Cascade the rename so no dangling showIf reference is left behind.
          if (f.showIf?.fieldId === oldId) return { ...f, showIf: { ...f.showIf, fieldId: newId } };
          return f;
        }),
      };
    });

    setExpandedFieldIds((prev) => {
      if (!prev.has(oldId)) return prev;
      const next = new Set(prev);
      next.delete(oldId);
      next.add(newId);
      return next;
    });
  };



  const showSnack = (msg: string) => setSnackbar(msg);

  const importJson = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const config = await loadFromPath(result.assets[0].uri);
      setState(deserializeFormConfig(config));
      setExpandedFieldIds(new Set());
      showSnack('Form imported');
    } catch (e) {
      showSnack(e instanceof Error ? e.message : 'Invalid config file');
    }
  };

  const exportJson = async () => {
    if (!valid) {
      setShowFormErrors(true);
      showSnack('Fix the highlighted issues before exporting');
      return;
    }
    try {
      const config = serializeFormConfig(state);
      validateFormConfig(config);
      const json = JSON.stringify(config, null, 2);
      const fileName = `${config.formTitle.replace(/[\s/\\:*?"<>|]+/g, '_')}.json`;

      if (Platform.OS === 'android') {
        const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return;
        const uri = await StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          fileName,
          'application/json',
        );
        await writeAsStringAsync(uri, json, { encoding: EncodingType.UTF8 });
        showSnack(`Saved as ${fileName}`);
      } else {
        const file = new File(Paths.cache, fileName);
        file.write(json);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
      }
    } catch (e) {
      showSnack(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const copyForAI = async () => {
    const prompt = buildAIPrompt(state);
    await Clipboard.setStringAsync(prompt);
    showSnack('AI prompt copied — paste it into your chatbot');
  };

  const handleSave = () => {
    if (!valid) {
      setShowFormErrors(true);
      showSnack('Fix the highlighted issues before saving');
      return;
    }
    const config = serializeFormConfig(state);
    try {
      validateFormConfig(config);
    } catch (e) {
      showSnack(e instanceof Error ? e.message : 'Invalid form config');
      return;
    }
    const importId = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addCustomForm(config, importId, session?.user?.id ?? null);
    loadSchema(config);
    setActivePresetId(importId);
    router.back();
  };

  if (showTemplatePicker) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Start a new form</Text>
        </View>
        <ScrollView contentContainerStyle={styles.templatePickerContent}>
          <Text style={styles.templatePickerHint}>Start blank, or from a template.</Text>
          <TouchableOpacity style={styles.templateOption} onPress={() => pickTemplate(null)}>
            <MaterialIcons name="note-add" size={20} color={colors.brand.primary} />
            <View style={styles.templateOptionText}>
              <Text style={styles.templateOptionTitle}>Blank form</Text>
              <Text style={styles.templateOptionSub}>Start from scratch.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.border.input} />
          </TouchableOpacity>
          {FORM_TEMPLATES.map((template) => (
            <TouchableOpacity
              key={template.key}
              style={styles.templateOption}
              onPress={() => pickTemplate(template.schema)}
            >
              <MaterialIcons name="description" size={20} color={colors.brand.primary} />
              <View style={styles.templateOptionText}>
                <Text style={styles.templateOptionTitle} numberOfLines={2}>{template.label}</Text>
                <Text style={styles.templateOptionSub}>
                  {template.schema.fields.length} fields · v{template.schema.version}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.border.input} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.topBarInner}>
          <View style={styles.topBarBrand}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
              <MaterialIcons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
            <View>
              <Text style={styles.screenTitle}>{state.formTitle || 'Untitled Form'}</Text>
              <Text style={styles.screenSub}>{state.fields.length} fields</Text>
            </View>
          </View>
          <View style={styles.topBarActions}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => router.push('/settings')}>
              <Text style={styles.smallBtnText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {/* Form Details panel */}
        <View style={styles.panel}>
          <TouchableOpacity style={styles.panelHeader} onPress={() => setMetaExpanded((v) => !v)}>
            <Text style={styles.panelLabel}>Form Details</Text>
            <View style={styles.panelHeaderRight}>
              {!metaExpanded && !!state.formTitle && (
                <Text style={styles.panelPreview} numberOfLines={1}>
                  {state.formTitle}
                </Text>
              )}
              <MaterialIcons
                name={metaExpanded ? 'expand-less' : 'expand-more'}
                size={20}
                color={colors.text.secondary}
              />
            </View>
          </TouchableOpacity>
          {metaExpanded && (
            <View style={styles.panelBody}>
              {showFormErrors && formErrors.length > 0 && (
                <View style={styles.formErrorsBox}>
                  {formErrors.map((e, i) => (
                    <Text key={i} style={styles.formErrorText}>
                      {e.message}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.metaField}>
                <Text style={styles.inputLabel}>
                  Title <Text style={styles.requiredMark}>*</Text>
                </Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.inputUnboxed}
                    value={state.formTitle}
                    onChangeText={(formTitle) =>
                      setState((s) => ({
                        ...s,
                        formTitle,
                        formId: formTitle.trim() ? `${slugify(formTitle)}-${slugSuffix}` : '',
                      }))
                    }
                    placeholder="e.g. Community Health Survey"
                    placeholderTextColor={colors.text.placeholder}
                  />
                  {!!state.formId && (
                    <Text style={styles.slugHint} numberOfLines={1}>
                      [{state.formId}]
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.metaField}>
                <Text style={styles.inputLabel}>Version</Text>
                <TextInput
                  style={styles.input}
                  value={state.version}
                  onChangeText={(version) => setState((s) => ({ ...s, version }))}
                  placeholder="1.0"
                  placeholderTextColor={colors.text.placeholder}
                />
              </View>
              <View style={styles.metaField}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={styles.input}
                  value={state.description}
                  onChangeText={(description) => setState((s) => ({ ...s, description }))}
                  placeholder="Optional description"
                  placeholderTextColor={colors.text.placeholder}
                />
              </View>
            </View>
          )}
        </View>

        {/* Sections panel */}
        <View style={styles.panel}>
          <TouchableOpacity style={styles.panelHeader} onPress={() => setSectionsExpanded((v) => !v)}>
            <Text style={styles.panelLabel}>Sections ({state.sections.length})</Text>
            <MaterialIcons
              name={sectionsExpanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={colors.text.secondary}
            />
          </TouchableOpacity>
          {sectionsExpanded && (
            <View style={styles.panelBody}>
              <SectionsPanel
                sections={state.sections}
                onChange={handleSectionsChange}
              />
            </View>
          )}
        </View>

        {/* Fields area */}
        <View style={styles.fieldsArea}>
          <View style={styles.fieldsToolbar}>
            <Text style={styles.panelLabel}>Fields ({state.fields.length})</Text>
            <TouchableOpacity style={styles.addFieldBtn} onPress={() => addField('text')}>
              <Text style={styles.addFieldBtnText}>+ Add field</Text>
            </TouchableOpacity>
          </View>

          {state.fields.length === 0 ? (
            <Text style={styles.emptyFields}>No fields yet — tap "+ Add field" to get started.</Text>
          ) : (
            state.fields.map((field, index) => (
              <FieldEditorRow
                key={field.id}
                field={field}
                index={index}
                total={state.fields.length}
                errors={fieldErrorsById.get(field.id) ?? []}
                sections={state.sections}
                otherFields={state.fields.filter((f) => f.id !== field.id)}
                expanded={expandedFieldIds.has(field.id)}
                onToggleExpand={() => toggleFieldExpanded(field.id)}
                onChange={(updated) => updateField(index, updated)}
                onLabelBlur={() => handleFieldLabelBlur(index)}
                onRemove={() => removeField(index)}
                onMoveUp={() => moveField(index, -1)}
                onMoveDown={() => moveField(index, 1)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.footerInner}>
          <View style={styles.footerLeft}>
            <TouchableOpacity style={styles.outlineBtn} onPress={importJson}>
              <Text style={styles.outlineBtnText}>↑ Import JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlineBtn} onPress={exportJson}>
              <Text style={styles.outlineBtnText}>↓ Export JSON</Text>
            </TouchableOpacity>
            <Pressable
              onPress={copyForAI}
              style={({ pressed }) => [styles.outlineBtn, styles.aiBtn, pressed && styles.aiBtnPressed]}
            >
              {({ pressed }) => (
                <>
                  <MaterialIcons name="auto-awesome" size={14} color={pressed ? '#9333EA' : colors.text.secondary} />
                  <Text style={[styles.outlineBtnText, pressed && styles.aiBtnTextPressed]}>Copy for AI</Text>
                </>
              )}
            </Pressable>
          </View>
          <View style={styles.footerRight}>
            {errors.length > 0 && (
              <Text style={styles.footerError}>
                {errors.length === 1 ? '1 error — fix to save' : `${errors.length} errors — fix to save`}
              </Text>
            )}
            <TouchableOpacity style={styles.outlineBtn} onPress={() => router.back()}>
              <Text style={styles.outlineBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !valid && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!valid}
            >
              <Text style={styles.saveBtnText}>Create form</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Toast message={snackbar} onDismiss={() => setSnackbar(null)} bottom={insets.bottom + 90} />
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background.app },
    topBar: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border.section,
      backgroundColor: colors.background.app,
    },
    topBarInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      maxWidth: 800,
      width: '100%',
      alignSelf: 'center',
    },
    topBarBrand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    iconBtn: { padding: 6 },
    screenTitle: { fontSize: 17, fontWeight: '700', color: colors.text.primary },
    screenSub: { fontSize: 12, color: colors.text.muted, marginTop: 1 },
    topBarActions: { flexDirection: 'row', gap: 6 },
    smallBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.background.muted,
      borderWidth: 1,
      borderColor: colors.border.section,
    },
    smallBtnText: { fontSize: 11.5, fontWeight: '600', color: colors.text.secondary },

    templatePickerContent: { 
      padding: 16, 
      paddingBottom: 24, 
      gap: 10,
      maxWidth: 800,
      width: '100%',
      alignSelf: 'center',
    },
    templatePickerHint: { fontSize: 13, color: colors.text.secondary, marginBottom: 4 },
    templateOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.section,
      backgroundColor: colors.background.white,
    },
    templateOptionText: { flex: 1, gap: 2 },
    templateOptionTitle: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
    templateOptionSub: { fontSize: 12, color: colors.text.muted },

    body: { flex: 1 },
    bodyContent: { 
      padding: 16, 
      paddingBottom: 24, 
      gap: 14,
      maxWidth: 800,
      width: '100%',
      alignSelf: 'center',
    },

    panel: {
      borderWidth: 1,
      borderColor: colors.border.section,
      borderRadius: 14,
      backgroundColor: colors.background.white,
      overflow: 'hidden',
    },
    panelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background.muted,
    },
    panelHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    panelLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: colors.text.secondary,
    },
    panelPreview: { fontSize: 12.5, color: colors.text.muted, maxWidth: 160 },
    panelBody: {
      paddingHorizontal: 14,
      paddingBottom: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.section,
      paddingTop: 12,
    },
    metaField: { gap: 6 },
    inputLabel: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      color: colors.text.muted,
    },
    requiredMark: { color: colors.text.danger },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.input,
      borderRadius: 10,
      backgroundColor: colors.background.white,
      paddingHorizontal: 12,
    },
    inputUnboxed: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text.primary,
      padding: 0,
    },
    slugHint: {
      fontSize: 12,
      color: colors.text.muted,
      marginLeft: 8,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
      flexShrink: 1,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border.input,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text.primary,
      backgroundColor: colors.background.white,
    },
    inputMono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
    formErrorsBox: {
      backgroundColor: colors.background.dangerSoft,
      borderWidth: 1,
      borderColor: colors.border.formSection,
      borderRadius: 10,
      padding: 10,
      gap: 3,
    },
    formErrorText: { fontSize: 12.5, color: colors.text.danger },

    fieldsArea: { gap: 8 },
    fieldsToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    addFieldBtn: {
      backgroundColor: colors.brand.primary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    addFieldBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.text.inverse },
    emptyFields: {
      textAlign: 'center',
      fontSize: 13,
      color: colors.text.muted,
      paddingVertical: 24,
    },

    footer: {
      paddingHorizontal: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.section,
      backgroundColor: colors.background.muted,
    },
    footerInner: {
      maxWidth: 800,
      width: '100%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
    },
    footerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    footerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    footerError: { fontSize: 12, fontWeight: '600', color: colors.text.danger, marginRight: 4 },
    outlineBtn: {
      borderWidth: 1,
      borderColor: colors.border.input,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.background.white,
    },
    outlineBtnText: { fontSize: 12.5, fontWeight: '600', color: colors.text.secondary },
    aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    aiBtnPressed: { borderColor: '#9333EA', backgroundColor: '#F3E8FF' },
    aiBtnTextPressed: { color: '#9333EA' },
    saveBtn: {
      backgroundColor: colors.brand.primary,
      borderRadius: 9,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    saveBtnDisabled: { backgroundColor: colors.action.disabled },
    saveBtnText: { fontSize: 13, fontWeight: '700', color: colors.text.inverse },
  });
