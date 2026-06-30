import React, { memo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Switch } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FieldDef, FieldType, FormSection } from '../../types';
import { FIELD_REGISTRY, FIELD_TYPE_ORDER } from '../../utils/fieldRegistry';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';

type Props = {
  field: FieldDef;
  index: number;
  total: number;
  errors: string[];
  sections: FormSection[];
  otherFields: FieldDef[];
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (updated: FieldDef) => void;
  onLabelBlur: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

function FieldEditorRow({
  field,
  index,
  total,
  errors,
  sections,
  otherFields,
  expanded,
  onToggleExpand,
  onChange,
  onLabelBlur,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const meta = FIELD_REGISTRY[field.type];
  const [optionsText, setOptionsText] = useState((field.options ?? []).join(', '));
  const hasErrors = errors.length > 0;
  const showIfEnabled = !!field.showIf;

  const update = (patch: Partial<FieldDef>) => onChange({ ...field, ...patch });

  const changeType = (type: FieldType) => {
    update({ type, ...FIELD_REGISTRY[type].defaultProps });
    if (type === 'select') setOptionsText((field.options ?? []).join(', '));
  };

  const commitOptions = (text: string) => {
    setOptionsText(text);
    const options = text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    update({ options });
  };

  return (
    <View style={[styles.card, { borderLeftColor: meta.color }, hasErrors && styles.cardError]}>
      <TouchableOpacity style={styles.header} onPress={onToggleExpand} activeOpacity={0.7}>
        <View style={[styles.typeIcon, { backgroundColor: meta.bg }]}>
          <MaterialIcons name={meta.icon} size={16} color={meta.color} />
        </View>
        <View style={styles.headerBody}>
          <Text style={styles.headerLabel} numberOfLines={1}>
            {field.label || 'Untitled field'}
          </Text>
          <Text style={styles.headerSub}>{meta.label}</Text>
        </View>
        {hasErrors && <View style={styles.errorDot} />}
        {field.required && !hasErrors && <Text style={styles.requiredStar}>*</Text>}
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={index === 0}
            style={styles.moveBtn}
          >
            <MaterialIcons name="arrow-upward" size={16} color={index === 0 ? colors.text.muted : colors.text.secondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={index === total - 1}
            style={styles.moveBtn}
          >
            <MaterialIcons
              name="arrow-downward"
              size={16}
              color={index === total - 1 ? colors.text.muted : colors.text.secondary}
            />
          </TouchableOpacity>
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={20}
            color={colors.text.secondary}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput
              style={styles.input}
              value={field.label}
              onChangeText={(label) => update({ label })}
              onBlur={onLabelBlur}
              placeholder="Question text"
              placeholderTextColor={colors.text.placeholder}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
              {FIELD_TYPE_ORDER.map((t) => {
                const tMeta = FIELD_REGISTRY[t];
                const selected = t === field.type;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeChip,
                      { borderColor: selected ? tMeta.color : colors.border.input },
                      selected && { backgroundColor: tMeta.bg },
                    ]}
                    onPress={() => changeType(t)}
                  >
                    <MaterialIcons name={tMeta.icon} size={14} color={selected ? tMeta.color : colors.text.secondary} />
                    <Text style={[styles.typeChipText, selected && { color: tMeta.color, fontWeight: '700' }]}>
                      {tMeta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Type-specific extra props */}
          {(field.type === 'text' || field.type === 'textarea' || field.type === 'number') && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Placeholder</Text>
              <TextInput
                style={styles.input}
                value={field.placeholder ?? ''}
                onChangeText={(placeholder) => update({ placeholder })}
                placeholder="Optional placeholder text"
                placeholderTextColor={colors.text.placeholder}
              />
            </View>
          )}

          {field.type === 'select' && (
            <>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Options (comma separated)</Text>
                <TextInput
                  style={styles.input}
                  value={optionsText}
                  onChangeText={commitOptions}
                  placeholder="e.g. Yes, No, Maybe"
                  placeholderTextColor={colors.text.placeholder}
                />
              </View>
              <View style={styles.checkboxRow}>
                <Switch value={!!field.multiple} onValueChange={(v) => update({ multiple: v })} />
                <Text style={styles.checkboxLabel}>Allow multiple answers (checkboxes)</Text>
              </View>
              <View style={styles.checkboxRow}>
                <Switch value={!!field.allowOther} onValueChange={(v) => update({ allowOther: v })} />
                <Text style={styles.checkboxLabel}>Add an "Other" free-text option</Text>
              </View>
            </>
          )}

          {field.type === 'rating' && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Maximum rating</Text>
              <TextInput
                style={styles.input}
                value={field.max !== undefined ? String(field.max) : ''}
                onChangeText={(text) => {
                  const n = parseInt(text, 10);
                  update({ max: text.trim() === '' ? undefined : Number.isNaN(n) ? field.max : n });
                }}
                keyboardType="number-pad"
                placeholder="5"
                placeholderTextColor={colors.text.placeholder}
              />
            </View>
          )}

          {field.type === 'image' && (
            <View style={styles.checkboxRow}>
              <Switch value={!!field.multiple} onValueChange={(v) => update({ multiple: v })} />
              <Text style={styles.checkboxLabel}>Allow multiple photos</Text>
            </View>
          )}

          {field.type === 'gps' && (
            <View style={styles.checkboxRow}>
              <Switch value={!!field.auto} onValueChange={(v) => update({ auto: v })} />
              <Text style={styles.checkboxLabel}>Capture automatically when an entry is created</Text>
            </View>
          )}

          {field.type === 'date' && (
            <View style={styles.checkboxRow}>
              <Switch value={!!field.auto} onValueChange={(v) => update({ auto: v })} />
              <Text style={styles.checkboxLabel}>Default to today when an entry is created</Text>
            </View>
          )}

          <View style={styles.row}>
            <TouchableOpacity
              style={styles.reqToggle}
              onPress={() => update({ required: !field.required })}
              activeOpacity={0.8}
            >
              <View style={[styles.reqPill, field.required && styles.reqPillOn]}>
                <View style={[styles.reqThumb, field.required && styles.reqThumbOn]} />
              </View>
              <Text style={styles.checkboxLabel}>Required</Text>
            </TouchableOpacity>
          </View>

          {sections.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Section</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeChip, !field.sectionId && styles.typeChipSelected]}
                  onPress={() => update({ sectionId: undefined })}
                >
                  <Text style={styles.typeChipText}>None</Text>
                </TouchableOpacity>
                {sections.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.typeChip, field.sectionId === s.id && styles.typeChipSelected]}
                    onPress={() => update({ sectionId: s.id })}
                  >
                    <Text style={styles.typeChipText}>{s.title || s.id}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.checkboxRow}>
            <Switch
              value={showIfEnabled}
              onValueChange={(v) =>
                update({ showIf: v ? { fieldId: otherFields[0]?.id ?? '', equals: '' } : undefined })
              }
              disabled={otherFields.length === 0}
            />
            <Text style={styles.checkboxLabel}>Conditional visibility</Text>
          </View>

          {showIfEnabled && field.showIf && (
            <View style={styles.condBox}>
              <Text style={styles.condLabel}>Show only if</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
                {otherFields.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.typeChip, field.showIf?.fieldId === f.id && styles.typeChipSelected]}
                    onPress={() => update({ showIf: { fieldId: f.id, equals: field.showIf?.equals ?? '' } })}
                  >
                    <Text style={styles.typeChipText}>{f.label || f.id}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.condLabel}>equals</Text>
              <TextInput
                style={styles.input}
                value={
                  Array.isArray(field.showIf.equals) ? field.showIf.equals.join(', ') : field.showIf.equals
                }
                onChangeText={(text) =>
                  update({ showIf: { fieldId: field.showIf?.fieldId ?? '', equals: text } })
                }
                placeholder="Value to match"
                placeholderTextColor={colors.text.placeholder}
              />
            </View>
          )}

          {errors.length > 0 && (
            <View style={styles.errorsBox}>
              {errors.map((msg, i) => (
                <Text key={i} style={styles.errorText}>
                  {msg}
                </Text>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
            <MaterialIcons name="delete-outline" size={16} color={colors.action.delete} />
            <Text style={styles.removeBtnText}>Remove field</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderLeftWidth: 4,
      borderColor: colors.border.default,
      borderRadius: 12,
      backgroundColor: colors.background.white,
      marginBottom: 8,
      overflow: 'hidden',
    },
    cardError: {
      borderColor: colors.text.danger,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    typeIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerBody: { flex: 1, minWidth: 0 },
    headerLabel: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
    headerSub: { fontSize: 11.5, color: colors.text.muted, marginTop: 1 },
    errorDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.text.danger },
    requiredStar: { fontSize: 14, fontWeight: '700', color: colors.brand.primary },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    moveBtn: { padding: 4 },
    body: {
      paddingHorizontal: 12,
      paddingBottom: 14,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.section,
      paddingTop: 12,
    },
    field: { gap: 6 },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      color: colors.text.muted,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border.input,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 14,
      color: colors.text.primary,
      backgroundColor: colors.background.white,
    },
    typeRow: { gap: 8, paddingVertical: 2 },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.input,
    },
    typeChipSelected: {
      borderColor: colors.brand.primary,
      backgroundColor: colors.brand.primarySoft,
    },
    typeChipText: { fontSize: 12, color: colors.text.secondary },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkboxLabel: { fontSize: 13, color: colors.text.secondary, flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center' },
    reqToggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    reqPill: {
      width: 40,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.border.input,
      padding: 2,
      justifyContent: 'center',
    },
    reqPillOn: { backgroundColor: colors.brand.primary },
    reqThumb: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.background.white,
    },
    reqThumbOn: { transform: [{ translateX: 18 }] },
    condBox: {
      backgroundColor: colors.background.muted,
      borderWidth: 1,
      borderColor: colors.border.section,
      borderRadius: 10,
      padding: 10,
      gap: 8,
    },
    condLabel: { fontSize: 11.5, fontWeight: '600', color: colors.text.secondary },
    errorsBox: { gap: 3 },
    errorText: { fontSize: 12, color: colors.text.danger },
    removeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 4,
    },
    removeBtnText: { fontSize: 12.5, fontWeight: '600', color: colors.action.delete },
  });

export default memo(FieldEditorRow);
