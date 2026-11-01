import type { MovementType } from "../types";

/**
 * Categorías que se crean al registrarse, para que el primer gasto se anote en 3 toques
 * sin pasar antes por una pantalla de configuración (hallazgo H-01: registro rápido).
 * Los ids son fijos: crear la cuenta dos veces no las duplica.
 */
export interface DefaultCategory {
  id: string;
  name: string;
  type: MovementType;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { id: "cat-transporte", name: "Transporte", type: "expense" },
  { id: "cat-alimentacion", name: "Alimentación", type: "expense" },
  { id: "cat-materiales", name: "Materiales", type: "expense" },
  { id: "cat-servicios", name: "Servicios", type: "expense" },
  { id: "cat-entretenimiento", name: "Entretenimiento", type: "expense" },
  { id: "cat-ahorro", name: "Ahorro", type: "expense" },
  { id: "cat-otros-gastos", name: "Otros gastos", type: "expense" },
  { id: "cat-mesada", name: "Mesada", type: "income" },
  { id: "cat-beca", name: "Beca o apoyo", type: "income" },
  { id: "cat-trabajo", name: "Trabajo", type: "income" },
  { id: "cat-otros-ingresos", name: "Otros ingresos", type: "income" },
];
