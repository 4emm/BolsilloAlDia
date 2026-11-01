import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/button';
import { AmountField, DateField } from '@/components/fields';
import { SyncTag } from '@/components/finance-views';
import { Screen } from '@/components/screen';
import { EmptyView, LoadingView } from '@/components/state-views';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { goalProgress } from '@/domain/goals';
import { formatAmountInput, formatCOP } from '@/domain/money';
import { validateMovement, type MovementErrors } from '@/domain/validation';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/lib/confirm';
import { useData } from '@/providers/data-provider';
import { describeError } from '@/services/api/client';
import type { MovementType } from '@/types';

/**
 * Formulario de movimiento (nuevo o edición). Pensado para registrar en pocos pasos:
 * monto → categoría → Guardar. Funciona igual sin conexión: guarda en SQLite y encola.
 */
export default function MovementFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; type?: string; goalId?: string }>();
  const isNew = params.id === 'new';
  const { ready, movements, categories, goals, countableMovements, today, actions } = useData();
  const existing = isNew ? undefined : movements.find((m) => m.id === params.id);

  const [type, setType] = useState<MovementType>(
    existing?.type ?? (params.type === 'income' ? 'income' : 'expense'),
  );
  const [amountText, setAmountText] = useState(existing ? formatAmountInput(String(existing.amount)) : '');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [goalId, setGoalId] = useState<string | null>(existing?.goalId ?? params.goalId ?? null);
  const [date, setDate] = useState(existing?.date ?? today);
  const [note, setNote] = useState(existing?.note ?? '');
  const [errors, setErrors] = useState<MovementErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Categorías del tipo elegido, las más usadas primero (así la habitual queda a un toque).
  const choices = useMemo(() => {
    const uses = new Map<string, number>();
    for (const m of movements) uses.set(m.categoryId, (uses.get(m.categoryId) ?? 0) + 1);
    return categories
      .filter((c) => c.type === type)
      .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'es'));
  }, [categories, movements, type]);

  // Metas a las que se puede aportar: las activas (y la que ya tenga este movimiento).
  const goalChoices = useMemo(
    () =>
      goals.filter(
        (g) => g.id === goalId || goalProgress(g, countableMovements, today).status === 'active',
      ),
    [goals, countableMovements, today, goalId],
  );

  if (!ready) return <Screen title="Movimiento" back><LoadingView /></Screen>;
  if (!isNew && !existing) {
    return (
      <Screen title="Movimiento" back>
        <EmptyView title="Este movimiento ya no existe" message="Pudo haberse eliminado desde otro dispositivo." />
      </Screen>
    );
  }

  function changeType(next: MovementType) {
    setType(next);
    const keep = categories.find((c) => c.id === categoryId && c.type === next);
    if (!keep) setCategoryId(null);
    if (next === 'income') setGoalId(null);
  }

  async function submit(another: boolean) {
    const result = validateMovement(
      { amountText, type, categoryId, goalId, date, note },
      categories,
      goals,
    );
    setErrors(result.errors);
    setFormError(null);
    if (!result.ok || !result.value) return;
    setSaving(true);
    try {
      if (isNew) await actions.createMovement(result.value);
      else await actions.updateMovement(params.id, result.value);
      if (another) {
        // "Guardar y registrar otro": se conserva el tipo y la fecha para anotar varios seguidos.
        setAmountText('');
        setNote('');
        setCategoryId(null);
        setErrors({});
        setSavedCount((n) => n + 1);
      } else {
        router.back();
      }
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  function requestDelete() {
    if (!existing) return;
    confirmAction({
      title: 'Eliminar movimiento',
      message: `¿Eliminar ${existing.type === 'income' ? 'el ingreso' : 'el gasto'} de ${formatCOP(existing.amount)}? Los totales se recalcularán.`,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        await actions.deleteMovement(existing.id);
        router.back();
      },
    });
  }

  return (
    <Screen
      title={isNew ? 'Nuevo movimiento' : 'Editar movimiento'}
      back
      edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {savedCount > 0 ? (
            <ThemedText accessibilityLiveRegion="polite" style={{ color: theme.success, fontWeight: '700' }}>
              ✓ Guardado ({savedCount}). Anota el siguiente.
            </ThemedText>
          ) : null}

          {existing && existing.syncState !== 'synced' ? (
            <Card>
              <SyncTag state={existing.syncState} error={existing.syncError} />
              {existing.syncState === 'conflict' ? (
                <>
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    {existing.syncError}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    No cuenta en tus totales hasta que se corrija. Edítalo y guarda, o descártalo.
                  </ThemedText>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Button
                        title="Reintentar"
                        variant="secondary"
                        compact
                        onPress={async () => {
                          await actions.retryConflict('movement', existing.id);
                          router.back();
                        }}
                      />
                    </View>
                    <View style={styles.flex}>
                      <Button
                        title="Descartar"
                        variant="danger"
                        compact
                        onPress={async () => {
                          await actions.discardConflict('movement', existing.id);
                          router.back();
                        }}
                      />
                    </View>
                  </View>
                </>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Está guardado en tu teléfono y se enviará cuando haya conexión.
                </ThemedText>
              )}
            </Card>
          ) : null}

          <Segmented<MovementType>
            options={[
              { value: 'expense', label: 'Gasto', color: 'expense' },
              { value: 'income', label: 'Ingreso', color: 'income' },
            ]}
            value={type}
            onChange={changeType}
          />

          <AmountField value={amountText} onChange={setAmountText} error={errors.amount} autoFocus={isNew} />

          <View style={styles.block}>
            <ThemedText type="smallBold">Categoría</ThemedText>
            {choices.length === 0 ? (
              <ThemedText themeColor="textSecondary">
                No tienes categorías de {type === 'expense' ? 'gasto' : 'ingreso'}
                {' '}todavía. Si acabas de crear tu cuenta, espera a que termine de sincronizar o crea una nueva.
              </ThemedText>
            ) : null}
            <View style={styles.chips}>
              {choices.map((c) => (
                <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
              ))}
              <Chip
                label="+ Nueva"
                onPress={() => router.push({ pathname: '/category/[id]', params: { id: 'new', type } })}
              />
            </View>
            {errors.category ? (
              <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
                {errors.category}
              </ThemedText>
            ) : null}
          </View>

          <DateField label="Fecha" value={date} onChange={setDate} error={errors.date} today={today} />

          <TextField
            label="Nota (opcional)"
            value={note}
            onChangeText={setNote}
            error={errors.note}
            placeholder="Ej. bus a la universidad"
            maxLength={200}
            returnKeyType="done"
          />

          {type === 'expense' && goalChoices.length > 0 ? (
            <View style={styles.block}>
              <ThemedText type="smallBold">¿Es un aporte a una meta de ahorro?</ThemedText>
              <View style={styles.chips}>
                <Chip label="No" selected={goalId === null} onPress={() => setGoalId(null)} />
                {goalChoices.map((g) => (
                  <Chip key={g.id} label={g.name} selected={goalId === g.id} onPress={() => setGoalId(g.id)} />
                ))}
              </View>
            </View>
          ) : null}

          {formError ? (
            <ThemedText accessibilityRole="alert" style={{ color: theme.danger }}>
              {formError}
            </ThemedText>
          ) : null}

          <Button title="Guardar" onPress={() => submit(false)} loading={saving} />
          {isNew ? (
            <Button title="Guardar y registrar otro" variant="secondary" onPress={() => submit(true)} disabled={saving} />
          ) : (
            <Button title="Eliminar movimiento" variant="danger" onPress={requestDelete} disabled={saving} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  block: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
});
