/**
 * Almacenamiento de tokens en el NAVEGADOR.
 *
 * `expo-secure-store` no existe en web, así que se usa `localStorage`.
 * La diferencia de seguridad es inherente a la web: cualquier script del mismo
 * origen puede leer estos valores. Por eso la app no guarda nada más sensible
 * que los tokens de sesión y el perfil público del usuario.
 */
import type { SecureStorage } from '@/services/auth/session-manager';

/** Prefijo para no chocar con otras claves del mismo dominio. */
const PREFIX = 'bolsillo:';

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Navegación privada o almacenamiento bloqueado.
    return null;
  }
}

export const secureStorage: SecureStorage = {
  async getItemAsync(key) {
    return getStorage()?.getItem(PREFIX + key) ?? null;
  },
  async setItemAsync(key, value) {
    getStorage()?.setItem(PREFIX + key, value);
  },
  async deleteItemAsync(key) {
    getStorage()?.removeItem(PREFIX + key);
  },
};
