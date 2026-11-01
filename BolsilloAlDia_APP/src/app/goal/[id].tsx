import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/button';
import { AmountField, DateField, deadlineShortcuts } from '@/components/fields';
import { GoalCard, MovementRow, SyncTag } from '@/components/finance-views';
import { Screen } from '@/components/screen';
import { EmptyView, LoadingView } from '@/components/state-views';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Card, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { goalProgress } from '@/domain/goals';
import { formatAmountInput } from '@/domain/money';
import { sortMovements } from '@/domain/summary';
import { validateGoal, type GoalErrors } from '@/domain/validation';
import { useLookups } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/lib/confirm';
import { useData } from '@/providers/data-provider';
import { describeError } from '@/services/api/client';

export default function GoalFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const isNew = params.id === 'new';
  const { ready, goals, movements, countableMovements, today, actions } = useData();
  const { categoryById } = useLookups();
  const existing = isNew ? undefined : goals.find((g) => g.id === params.id);

  const [name, setName] = useState(existing?.name ?? '');
  const [targetText, setTargetText] = useState(existing ? formatAmountInput(String(existing.targetAmount)) : '');
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');
  const [errors, setErrors] = useState<GoalErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const contributions = useMemo(
    () => sortMovements(movements.filter((m) => m.goalId === params.id)),
    [movements, params.id],
  );

  if (!ready) return <Screen title="Meta" back><LoadingView /></Screen>;
  if (!isNew && !existing) {
    return (
      <Screen title="Meta" back>
        <EmptyView title="Esta meta ya no existe" message="Pudo haberse eliminado desde otro dispositivo." />
      </Screen>
    );
  }

  async function submit() {
    const result = validateGoal({ name, targetText, deadline }, today, isNew);
    setErrors(result.errors);
    setFormError(null);
    if (!result.ok || !result.value) return;
    setSaving(true);
    try {
      if (isNew) await actions.createGoal(result.value);
      else await actions.updateGoal(params.id, result.value);
      router.back();
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  function requestDelete() {
    if (!existing) return;
    confirmAction({
      title: 'Eliminar meta',
      message: `¿Eliminar la meta “${existing.name}”? ${
        contributions.length > 0
          ? `Tus ${contributions.length} aportes se conservan como gastos normales.`
          : ''
      }`,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        await actions.deleteGoal(existing.id);
        router.back();
      },
    });
  }

  return (
    <Screen title={isNew ? 'Nueva meta' : 'Meta de ahorro'} back edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {existing ? (
            <>
              <GoalCard
                goal={existing}
                progress={goalProgress(existing, countableMovements, today)}
                onPress={() => {}}
              />
              {existing.syncState === 'conflict' && existing.syncError ? (
                <Card>
                  <SyncTag state="conflict" error={existing.syncError} />
                  <ThemedText type="small" style={{ color: theme.danger }}>{existing.syncError}</ThemedText>
                </Card>
              ) : null}
              <Button
                title="Abonar a esta meta"
                onPress={() =>
                  router.push({
                    pathname: '/movement/[id]',
                    params: { id: 'new', type: 'expense', goalId: existing.id },
                  })
                }
              />
            </>
          ) : null}

          <TextField
            label="Nombre de la meta"
            value={name}
            onChangeText={setName}
            error={errors.name}
            placeholder="Ej. Portátil para la universidad"
            autoFocus={isNew}
            maxLength={60}
          />
          <AmountField label="Monto objetivo" value={targetText} onChange={setTargetText} error={errors.target} />
          <DateField
            label="Fecha límite"
            value={deadline}
            onChange={setDeadline}
            error={errors.deadline}
            today={today}
            quick={deadlineShortcuts(today)}
          />

          {formError ? (
            <ThemedText accessibilityRole="alert" style={{ color: theme.danger }}>{formError}</ThemedText>
          ) : null}

          <Button title="Guardar" onPress={submit} loading={saving} />

          {existing ? (
            <>
              <View style={styles.block}>
                <SectionTitle>Aportes</SectionTitle>
                {contributions.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    Aún no hay aportes. Registra un gasto y márcalo como aporte a esta meta.
                  </ThemedText>
                ) : (
                  contributions.map((m) => (
                    <MovementRow
                      key={m.id}
                      movement={m}
                      categoryName={categoryById.get(m.categoryId)?.name ?? 'Sin categoría'}
                      onPress={() => router.push({ pathname: '/movement/[id]', params: { id: m.id } })}
                    />
                  ))
                )}
              </View>
              <Button title="Eliminar meta" variant="danger" onPress={requestDelete} disabled={saving} />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  block: { gap: Spacing.two, marginTop: Spacing.three },
});
