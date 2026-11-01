import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/button';
import { AmountField } from '@/components/fields';
import { SyncTag } from '@/components/finance-views';
import { Screen } from '@/components/screen';
import { EmptyView, LoadingView } from '@/components/state-views';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Card, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatAmountInput } from '@/domain/money';
import { validateCategory, type CategoryErrors } from '@/domain/validation';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/lib/confirm';
import { useData } from '@/providers/data-provider';
import { describeError } from '@/services/api/client';
import type { MovementType } from '@/types';

export default function CategoryFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const isNew = params.id === 'new';
  const { ready, categories, movements, actions } = useData();
  const existing = isNew ? undefined : categories.find((c) => c.id === params.id);

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<MovementType>(
    existing?.type ?? (params.type === 'income' ? 'income' : 'expense'),
  );
  const [budgetText, setBudgetText] = useState(
    existing?.monthlyBudget ? formatAmountInput(String(existing.monthlyBudget)) : '',
  );
  const [errors, setErrors] = useState<CategoryErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!ready) return <Screen title="Categoría" back><LoadingView /></Screen>;
  if (!isNew && !existing) {
    return (
      <Screen title="Categoría" back>
        <EmptyView title="Esta categoría ya no existe" message="Pudo haberse eliminado desde otro dispositivo." />
      </Screen>
    );
  }

  async function submit() {
    const result = validateCategory({ name, type, budgetText }, categories, isNew ? null : params.id);
    setErrors(result.errors);
    setFormError(null);
    if (!result.ok || !result.value) return;
    setSaving(true);
    try {
      if (isNew) await actions.createCategory(result.value);
      else await actions.updateCategory(params.id, result.value);
      router.back();
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  function requestDelete() {
    if (!existing) return;
    const count = movements.filter((m) => m.categoryId === existing.id).length;
    confirmAction({
      title: 'Eliminar categoría',
      message:
        count > 0
          ? `“${existing.name}” tiene ${count} ${count === 1 ? 'movimiento' : 'movimientos'}. Si la eliminas, también se eliminarán y tus totales se recalcularán.`
          : `¿Eliminar la categoría “${existing.name}”?`,
      confirmLabel: count > 0 ? 'Eliminar todo' : 'Eliminar',
      onConfirm: async () => {
        await actions.deleteCategory(existing.id);
        router.back();
      },
    });
  }

  return (
    <Screen title={isNew ? 'Nueva categoría' : 'Editar categoría'} back edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {existing && existing.syncState !== 'synced' ? (
            <Card>
              <SyncTag state={existing.syncState} error={existing.syncError} />
              {existing.syncError ? (
                <ThemedText type="small" style={{ color: theme.danger }}>{existing.syncError}</ThemedText>
              ) : null}
            </Card>
          ) : null}

          <TextField
            label="Nombre"
            value={name}
            onChangeText={setName}
            error={errors.name}
            placeholder="Ej. Transporte"
            autoFocus={isNew}
            maxLength={60}
          />

          {isNew ? (
            <View style={styles.block}>
              <ThemedText type="smallBold">Tipo</ThemedText>
              <Segmented<MovementType>
                options={[
                  { value: 'expense', label: 'Gasto', color: 'expense' },
                  { value: 'income', label: 'Ingreso', color: 'income' },
                ]}
                value={type}
                onChange={(t) => {
                  setType(t);
                  if (t === 'income') setBudgetText('');
                }}
              />
            </View>
          ) : (
            <ThemedText themeColor="textSecondary">
              Tipo: {existing?.type === 'income' ? 'Ingreso' : 'Gasto'} (no se puede cambiar porque tiene movimientos asociados)
            </ThemedText>
          )}

          {type === 'expense' ? (
            <AmountField
              label="Presupuesto mensual (opcional)"
              value={budgetText}
              onChange={setBudgetText}
              error={errors.budget}
              placeholder="Sin presupuesto"
            />
          ) : null}
          {type === 'expense' ? (
            <ThemedText type="caption" themeColor="textSecondary">
              Con un presupuesto, la app te avisa cuando lo vas a superar y mide tu cumplimiento semanal y mensual.
            </ThemedText>
          ) : null}

          {formError ? (
            <ThemedText accessibilityRole="alert" style={{ color: theme.danger }}>{formError}</ThemedText>
          ) : null}

          <Button title="Guardar" onPress={submit} loading={saving} />
          {!isNew ? <Button title="Eliminar categoría" variant="danger" onPress={requestDelete} disabled={saving} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  block: { gap: Spacing.two },
});
