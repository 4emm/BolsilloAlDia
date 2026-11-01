/**
 * Validación de los formularios. Se valida en el teléfono para dar respuesta inmediata
 * (y poder guardar sin conexión), pero la API vuelve a validar todo al sincronizar.
 */
import { MAX_AMOUNT, parseAmount } from './money';
import { isValidDate } from './periods';
import type { Category, Goal, MovementType } from '@/types';

export interface Validation<TValue, TErrors> {
  ok: boolean;
  errors: TErrors;
  /** Presente solo si ok. */
  value?: TValue;
}

const NAME_MAX = 60;
const NOTE_MAX = 200;

// ───────────── Movimiento ─────────────

export interface MovementForm {
  amountText: string;
  type: MovementType;
  categoryId: string | null;
  goalId: string | null;
  date: string;
  note: string;
}
export interface MovementErrors {
  amount?: string;
  category?: string;
  date?: string;
  note?: string;
}
export interface MovementValue {
  amount: number;
  type: MovementType;
  categoryId: string;
  goalId: string | null;
  date: string;
  note: string;
}

/** El monto debe ser un número positivo y la categoría debe existir (y ser del mismo tipo). */
export function validateMovement(
  form: MovementForm,
  categories: Pick<Category, 'id' | 'type'>[],
  goals: Pick<Goal, 'id'>[],
): Validation<MovementValue, MovementErrors> {
  const errors: MovementErrors = {};
  const amount = parseAmount(form.amountText);
  if (form.amountText.trim() === '') errors.amount = 'Escribe el monto';
  else if (amount === null) errors.amount = 'El monto debe ser un número';
  else if (amount <= 0) errors.amount = 'El monto debe ser mayor que cero';
  else if (amount > MAX_AMOUNT) errors.amount = 'El monto es demasiado grande';

  const category = categories.find((c) => c.id === form.categoryId);
  if (!form.categoryId) errors.category = 'Elige una categoría';
  else if (!category) errors.category = 'La categoría ya no existe';
  else if (category.type !== form.type) {
    errors.category = 'La categoría no es de ese tipo de movimiento';
  }

  if (!isValidDate(form.date)) errors.date = 'La fecha debe ser válida (AAAA-MM-DD)';
  if (form.note.trim().length > NOTE_MAX) errors.note = `La nota admite hasta ${NOTE_MAX} caracteres`;

  const ok = Object.keys(errors).length === 0 && amount !== null && !!form.categoryId;
  if (!ok) return { ok: false, errors };

  // Un aporte a una meta solo aplica a gastos y a metas que existan; si no, se ignora el vínculo.
  const goalId =
    form.type === 'expense' && form.goalId && goals.some((g) => g.id === form.goalId)
      ? form.goalId
      : null;
  return {
    ok: true,
    errors,
    value: {
      amount: amount!,
      type: form.type,
      categoryId: form.categoryId!,
      goalId,
      date: form.date,
      note: form.note.trim(),
    },
  };
}

// ───────────── Categoría ─────────────

export interface CategoryForm {
  name: string;
  type: MovementType;
  /** Presupuesto mensual; vacío = sin presupuesto. */
  budgetText: string;
}
export interface CategoryErrors {
  name?: string;
  budget?: string;
}
export interface CategoryValue {
  name: string;
  type: MovementType;
  monthlyBudget: number | null;
}

export function validateCategory(
  form: CategoryForm,
  existing: Pick<Category, 'id' | 'name' | 'type'>[],
  editingId: string | null,
): Validation<CategoryValue, CategoryErrors> {
  const errors: CategoryErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'Escribe el nombre de la categoría';
  else if (name.length > NAME_MAX) errors.name = `El nombre admite hasta ${NAME_MAX} caracteres`;
  else if (
    existing.some(
      (c) =>
        c.id !== editingId && c.type === form.type && c.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = 'Ya tienes una categoría con ese nombre';
  }

  let monthlyBudget: number | null = null;
  if (form.budgetText.trim() !== '') {
    if (form.type !== 'expense') errors.budget = 'Solo las categorías de gasto tienen presupuesto';
    else {
      const n = parseAmount(form.budgetText);
      if (n === null || n <= 0) errors.budget = 'El presupuesto debe ser un monto mayor que cero';
      else monthlyBudget = n;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, errors, value: { name, type: form.type, monthlyBudget } };
}

// ───────────── Meta ─────────────

export interface GoalForm {
  name: string;
  targetText: string;
  deadline: string;
}
export interface GoalErrors {
  name?: string;
  target?: string;
  deadline?: string;
}
export interface GoalValue {
  name: string;
  targetAmount: number;
  deadline: string;
}

/** Al CREAR una meta la fecha límite no puede estar en el pasado (al editar sí: puede haber vencido). */
export function validateGoal(
  form: GoalForm,
  today: string,
  isNew: boolean,
): Validation<GoalValue, GoalErrors> {
  const errors: GoalErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'Escribe el nombre de la meta';
  else if (name.length > NAME_MAX) errors.name = `El nombre admite hasta ${NAME_MAX} caracteres`;

  const target = parseAmount(form.targetText);
  if (form.targetText.trim() === '') errors.target = 'Escribe el monto objetivo';
  else if (target === null || target <= 0) errors.target = 'El monto objetivo debe ser mayor que cero';
  else if (target > MAX_AMOUNT) errors.target = 'El monto es demasiado grande';

  if (!isValidDate(form.deadline)) errors.deadline = 'La fecha límite debe ser válida (AAAA-MM-DD)';
  else if (isNew && form.deadline < today) errors.deadline = 'La fecha límite no puede ser anterior a hoy';

  if (Object.keys(errors).length > 0 || target === null) return { ok: false, errors };
  return { ok: true, errors, value: { name, targetAmount: target, deadline: form.deadline } };
}
