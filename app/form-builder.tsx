import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StorageAccessFramework, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { usePickerStore } from '../store/pickerStore';
import { useAuthStore } from '../store/authStore';
import { useFormStore } from '../store/formStore';
import { loadFromPath, validateFormConfig } from '../utils/schemaLoader';
import {
  BuilderState,
  createEmptyBuilderState,
  deserializeFormConfig,
  generateFieldId,
  generateSectionId,
  serializeFormConfig,
  slugify,
  validateFormConfigForSave,
} from '../utils/formBuilderSerializer';
import { createBlankField, FIELD_REGISTRY, FIELD_TYPE_ORDER } from '../utils/fieldRegistry';
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

  const [state, setState] = useState<BuilderState>(createEmptyBuilderState());
  const [metaExpanded, setMetaExpanded] = useState(true);
  const [sectionsExpanded, setSectionsExpanded] = useState(false);
  const [expandedFieldIds, setExpandedFieldIds] = useState<Set<string>>(new Set());
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [showFormErrors, setShowFormErrors] = useState(false);

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

  const handleFormIdBlur = () => {
    if (!state.formId.trim() && state.formTitle.trim()) {
      setState((s) => ({ ...s, formId: slugify(s.formTitle) }));
    }
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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarBrand}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.screenTitle}>Form Builder</Text>
            <Text style={styles.screenSub}>
              {state.fields.length} field{state.fields.length === 1 ? '' : 's'} · {state.sections.length} section
              {state.sections.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
        <View style={styles.topBarActions}>
          <TouchableOpacity style={styles.smallBtn} onPress={collapseAll}>
            <Text style={styles.smallBtnText}>Collapse all</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.smallBtn} onPress={expandAll}>
            <Text style={styles.smallBtnText}>Expand all</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {/* Form Details panel */}
        <View style={styles.panel}>
          <TouchableOpacity style={styles.panelHeader} onPress={() => setMetaExpanded((v) => !v)}>
            <Text style={styles.panelLabel}>Form Details</Text>
            <View style={styles.panelHeaderRight}>
              {!metaExpanded && state.formTitle && (
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
                <TextInput
                  style={styles.input}
                  value={state.formTitle}
                  onChangeText={(formTitle) => setState((s) => ({ ...s, formTitle }))}
                  onBlur={handleFormIdBlur}
                  placeholder="e.g. Community Health Survey"
                  placeholderTextColor={colors.text.placeholder}
                />
              </View>
              <View style={styles.metaField}>
                <Text style={styles.inputLabel}>
                  Form ID (slug) <Text style={styles.requiredMark}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, styles.inputMono]}
                  value={state.formId}
                  onChangeText={(formId) => setState((s) => ({ ...s, formId: slugify(formId) }))}
                  placeholder="community-health-v1"
                  placeholderTextColor={colors.text.placeholder}
                  autoCapitalize="none"
                />
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
        <View style={styles.footerRow}>
          <TouchableOpacity style={styles.outlineBtn} onPress={importJson}>
            <Text style={styles.outlineBtnText}>↑ Import JSON</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={exportJson}>
            <Text style={styles.outlineBtnText}>↓ Export JSON</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.footerError}>
            {errors.length > 0 ? (errors.length === 1 ? '1 error — fix to save' : `${errors.length} errors — fix to save`) : ''}
          </Text>
          <View style={styles.footerRowRight}>
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.section,
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

    body: { flex: 1 },
    bodyContent: { padding: 16, paddingBottom: 24, gap: 14 },

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
      gap: 10,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    footerRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    footerError: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.text.danger },
    outlineBtn: {
      borderWidth: 1,
      borderColor: colors.border.input,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.background.white,
    },
    outlineBtnText: { fontSize: 12.5, fontWeight: '600', color: colors.text.secondary },
    saveBtn: {
      backgroundColor: colors.brand.primary,
      borderRadius: 9,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    saveBtnDisabled: { backgroundColor: colors.action.disabled },
    saveBtnText: { fontSize: 13, fontWeight: '700', color: colors.text.inverse },
  });
