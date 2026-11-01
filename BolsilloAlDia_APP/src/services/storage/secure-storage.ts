/**
 * Almacenamiento de tokens en NATIVO (iOS/Android): Keychain / Keystore.
 * En web se usa `secure-storage.web.ts` (localStorage), que Metro resuelve solo.
 */
import * as SecureStore from 'expo-secure-store';
import type { SecureStorage } from '@/services/auth/session-manager';

export const secureStorage: SecureStorage = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};
