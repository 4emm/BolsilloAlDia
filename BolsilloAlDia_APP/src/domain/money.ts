/**
 * Dinero. Los montos son pesos colombianos ENTEROS: así las sumas son exactas
 * (con decimales binarios 0.1 + 0.2 ≠ 0.3) y el registro es más rápido (sin coma decimal).
 */
export const MAX_AMOUNT = 999_999_999_999;

/** 1234567 → "1.234.567" (agrupación manual: no depende de Intl, que varía entre dispositivos). */
export function groupThousands(n: number): string {
  return String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 12500 → "$ 12.500"; -3000 → "-$ 3.000". */
export function formatCOP(n: number): string {
  return `${n < 0 ? '-' : ''}$ ${groupThousands(n)}`;
}

/** Con signo explícito para listas de movimientos: gasto "-$ 2.000", ingreso "+$ 50.000". */
export function formatSigned(amount: number, type: 'expense' | 'income'): string {
  return `${type === 'expense' ? '-' : '+'}$ ${groupThousands(amount)}`;
}

/**
 * Texto del campo de monto → número, o null si no es un monto válido.
 * Acepta separadores de miles ("12.500", "12 500", "12,500"); rechaza letras, signos y vacío.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.trim();
  if (text === '' || !/^[\d.,\s]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  if (digits === '' || digits.length > 12) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** Mientras el usuario escribe: deja solo dígitos y los agrupa ("1250" → "1.250"). */
export function formatAmountInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12).replace(/^0+(?=\d)/, '');
  return digits === '' ? '' : groupThousands(Number(digits));
}

/** Porcentaje entero (0–100 recortado) de `part` sobre `whole`; 0 si `whole` es 0. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}
