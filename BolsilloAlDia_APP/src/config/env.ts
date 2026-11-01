/**
 * Configuración por ambiente.
 *
 * Expo inyecta en el bundle las variables que empiezan con EXPO_PUBLIC_ leyéndolas de
 * `.env`, `.env.development`, `.env.production`, etc. Deben referenciarse de forma literal
 * (process.env.EXPO_PUBLIC_X), no desestructuradas.
 *
 * ⚠  Todo lo que lleve prefijo EXPO_PUBLIC_ queda visible dentro de la app: nunca pongas secretos aquí.
 */
import { Platform } from 'react-native';

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL;

/**
 * En la web de producción la API sirve la propia app desde el mismo dominio, así que se
 * usan rutas relativas ("/api/..."). Eso evita CORS y hace que el enlace de Vercel
 * funcione sin importar el dominio final.
 *
 * En desarrollo (web o nativo) y en las apps nativas se usa EXPO_PUBLIC_API_URL.
 */
const useRelativeUrl = Platform.OS === 'web' && !__DEV__;

/** URL base de BolsilloAlDia_API, sin "/" final. En un dispositivo físico usa la IP de tu PC, no localhost. */
export const API_URL = (
  useRelativeUrl ? '' : rawApiUrl && rawApiUrl.length > 0 ? rawApiUrl : 'http://localhost:3000'
).replace(/\/+$/, '');

/** Texto para mostrar en pantalla cuando la API va por el mismo dominio. */
export const API_URL_LABEL = API_URL || 'mismo dominio';

/** Tiempo máximo de espera por petición antes de considerarla un fallo de red. */
export const REQUEST_TIMEOUT_MS = 10_000;
