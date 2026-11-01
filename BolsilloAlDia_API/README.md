# BolsilloAlDía · API

API REST de **BolsilloAlDía** (Proyecto de aula N.º 5 · Desarrollo Móvil · Tecnológico de Antioquia).
La app móvil ([`BolsilloAlDia_APP`](../BolsilloAlDia_APP)) **nunca habla con Firebase**: todo pasa por esta API, que usa
**Firebase Authentication** (correo/contraseña) y **Cloud Firestore** desde el servidor. Está construida siguiendo la
arquitectura de la *Guía 1* (Next.js 16 + Route Handlers + Zod + Firebase Admin SDK).

```
App móvil (Expo)  ──HTTPS/JSON──▶  BolsilloAlDia_API (Next.js 16)  ──Admin SDK──▶  Firebase Auth + Firestore
 SQLite + cola offline               Route Handlers · Zod · guard                    usuarios/{uid}/…
```

Tres ideas explican el diseño:

1. **Las credenciales de administrador viven solo aquí**, en variables de entorno. La app solo conoce la URL de la API.
2. **Las reglas de integridad están en un solo lugar** (`lib/domain/sync-rules.ts`): conflictos, borrados y referencias.
3. **Sincronización idempotente**: el `id` de cada registro lo genera la app (UUID) y es el id del documento en Firestore.
   Reenviar el mismo registro nunca lo duplica.

## Endpoints

Todos los errores tienen la forma `{ "error": { "code": "INVALID_REFERENCE", "message": "…" } }`. La documentación
interactiva (Swagger UI) está en **`/api/docs`** y la especificación OpenAPI en **`/api/openapi.json`**; se genera desde los
esquemas Zod, así que no puede contradecir al código (una prueba compara las rutas documentadas con los archivos `route.ts`).

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/health` | Público | Comprueba que el servidor responde |
| `POST /api/auth/register` | Público | Crea la cuenta, sus 11 categorías iniciales e inicia sesión |
| `POST /api/auth/login` | Público | Inicia sesión |
| `POST /api/auth/refresh` | Público | Cambia un `refreshToken` por un `idToken` nuevo |
| `GET /api/auth/me` | Autenticado | Usuario de la sesión |
| `GET /api/categories?updatedSince=` | Autenticado | Cambios de categorías desde el cursor (incluye lápidas de eliminadas) |
| `GET · PUT · DELETE /api/categories/:id` | Autenticado | Leer · crear/actualizar (idempotente) · eliminar |
| `GET /api/goals?updatedSince=` | Autenticado | Cambios de metas de ahorro |
| `GET · PUT · DELETE /api/goals/:id` | Autenticado | Ídem para metas |
| `GET /api/movements?updatedSince=` | Autenticado | Cambios de movimientos (gastos e ingresos) |
| `GET · PUT · DELETE /api/movements/:id` | Autenticado | Ídem para movimientos; `409 INVALID_REFERENCE` si su categoría/meta ya no existe |

La respuesta de `PUT` y `DELETE` es `{ item, applied }`. `applied: false` significa que el servidor **conservó su versión**
(la edición era más vieja, o el registro ya estaba eliminado) y `item` trae esa versión.

## Modelo de datos en Firestore

Colecciones en español, como recomienda el enunciado. Todo cuelga del usuario, así que **una persona no puede leer ni
escribir datos de otra**: la ruta se arma con el `uid` del token verificado, nunca con datos de la petición.

| Ruta | Campos principales |
|---|---|
| `usuarios/{uid}` | `email`, `displayName`, `createdAt` |
| `usuarios/{uid}/categorias/{id}` | `name`, `type` (`expense`\|`income`), `monthlyBudget`, `createdAt`, `clientUpdatedAt`, `updatedAt` |
| `usuarios/{uid}/metas/{id}` | `name`, `targetAmount`, `deadline` (AAAA-MM-DD), metadatos de sincronización |
| `usuarios/{uid}/movimientos/{id}` | `amount` (pesos enteros > 0), `type`, `categoryId`, `goalId` (aporte a una meta), `date` (AAAA-MM-DD), `note`, metadatos |
| `usuarios/{uid}/historial/{id}` | Bitácora de cambios: `entity`, `entityId`, `action` (`create`/`update`/`delete`), `at` |

Un registro eliminado queda como **lápida** (`deleted: true`, sin datos): así los demás dispositivos se enteran del borrado y
ningún reintento puede revivirlo. Las reglas de Firestore (`firestore.rules`) **bloquean el acceso directo a `usuarios/**`**:
solo el Admin SDK (que se salta las reglas) puede leer y escribir.

## Regla de resolución de conflictos

> **La última edición gana, y borrar gana siempre.** Implementada en [`lib/domain/sync-rules.ts`](lib/domain/sync-rules.ts).

1. Cada cambio viaja con `clientUpdatedAt`: la hora del teléfono en que el usuario lo hizo.
2. Si el servidor ya tiene una versión con `clientUpdatedAt` **más reciente**, descarta el cambio entrante y responde con la
   suya (`applied: false`).
3. Un registro eliminado **nunca se revive**: ni una edición tardía hecha sin conexión ni un reintento.
4. Repetir exactamente la misma escritura da el mismo resultado y ni siquiera se escribe (la hora `updatedAt` no cambia).
5. Un `clientUpdatedAt` del futuro lejano (reloj adelantado) se recorta a la hora del servidor.

**Por qué esta regla:** son datos personales que casi siempre edita una sola persona, así que los choques reales son raros
(p. ej. editar el mismo gasto desde dos teléfonos). "Última edición gana" es determinista, fácil de explicar y no obliga al
servidor a fusionar campos. Borrar gana para que un registro eliminado no reaparezca "de la nada" al reconectar. Además el
servidor **nunca calcula totales**: la app los recalcula con sus datos locales, por eso un conflicto no puede cambiar un total
de forma inexplicable.

## Puesta en marcha

Requisitos: Node.js 22+ y npm. (Java 21+ solo si usas los emuladores.)

```bash
npm install
cp .env.example .env     # en PowerShell: Copy-Item .env.example .env
```

### Opción A · Proyecto real de Firebase

1. Firebase Console → **Authentication → Comenzar → Correo/contraseña** y **Firestore → Crear base de datos**.
2. Configuración del proyecto → **Cuentas de servicio → Generar nueva clave privada** y copia `project_id`, `client_email` y
   `private_key` al `.env` (la llave entre comillas dobles y con los saltos de línea como `\n`). **Borra el `.json` descargado.**
3. Configuración del proyecto → General → *Clave de API web* → `FIREBASE_WEB_API_KEY`.
4. Pega `firestore.rules` en Firestore → Reglas. El archivo bloquea `usuarios/**` y deja intactas las demás
   colecciones, por si el proyecto Firebase se comparte con otras apps. Si es exclusivo de BolsilloAlDía, puedes
   usar un `deny-all` global.

### Opción B · Emuladores locales (sin proyecto ni credenciales)

Descomenta las tres líneas del bloque "emuladores" de `.env.example` en tu `.env` y, en otra terminal:

```bash
npm run emulators        # Auth en :9099 y Firestore en :8080 (la primera vez descarga ~100 MB)
```

### Arrancar

```bash
npm run dev              # http://localhost:3000   ·   documentación en /api/docs
npm run dev:lan          # acepta conexiones de la red (necesario para usarla desde el teléfono)
```

En Windows, permite el puerto 3000 en el Firewall la primera vez que se te pregunte (red privada).

### Scripts

| Comando | Qué hace |
|---|---|
| `npm run create-user -- correo "clave" "Nombre"` | Crea (o actualiza) un usuario de prueba con sus categorías iniciales |
| `npm run reset-user -- correo` | Deja la cuenta "como nueva": borra sus datos y recrea las categorías iniciales |
| `npm run smoke` | Prueba de extremo a extremo (43 comprobaciones) contra la API en marcha; crea y elimina usuarios temporales |
| `npm run typecheck` · `npm test` · `npm run lint` · `npm run build` | Verificación estándar |

## Pruebas

- `npm test` — **57 pruebas** (Vitest): esquemas Zod, formato de errores, guard de autenticación, regla de conflictos,
  integridad de referencias y la capa de datos completa (idempotencia, ediciones viejas, lápidas, historial) sobre un Firestore
  en memoria, más la validez y no-desfase de la especificación OpenAPI.
- `npm run smoke` — **43 comprobaciones** contra la API real: registro/login/refresh, 401, validaciones 400, idempotencia
  (reenviar el mismo movimiento no lo duplica), edición vieja descartada, borrado sin resurrección, `updatedSince`,
  409 por referencias, aislamiento entre usuarios.

## Seguridad

| Amenaza | Control |
|---|---|
| Secretos de administrador filtrados | Solo en variables de entorno; `.env*` y `*-firebase-adminsdk-*.json` están en `.gitignore` |
| Leer o escribir datos de otra persona | Todo cuelga de `usuarios/{uid}` con el `uid` del token verificado; las reglas de Firestore bloquean el acceso directo a `usuarios/**` |
| Entradas maliciosas | Zod valida cuerpo, parámetros y `id` (solo `A-Z a-z 0-9 - _`) en todas las rutas |
| Enumeración de correos | Un único mensaje para credenciales inválidas |
| Filtración de detalles internos | Los errores inesperados responden 500 genérico y se registran solo en el servidor |
| Reloj adelantado del teléfono | `clientUpdatedAt` se recorta a la hora del servidor + 5 min |

## Despliegue en Vercel

1. Sube el repositorio a GitHub **sin** `.env` (`git ls-files | grep -E "\.env$|adminsdk"` no debe imprimir nada).
2. En Vercel: *Add New → Project*, elige el repo; el *Framework Preset* debe decir Next.js (ya hay `vercel.json`).
3. *Settings → Environment Variables*: crea `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_CLIENT_EMAIL` y
   `FIREBASE_PRIVATE_KEY` — **sin comillas** (en `.env` van con comillas; en Vercel serían parte del valor).
4. Despliega y prueba: `curl https://TU-PROYECTO.vercel.app/api/health` y un login real.
5. En la app: `EXPO_PUBLIC_API_URL=https://TU-PROYECTO.vercel.app` y `npx expo start -c`.

`firebase-admin` está fijado en la versión 13 a propósito: la 14 puede dar `ERR_REQUIRE_ESM` en versiones de Node de Vercel
anteriores a 22.12.

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Faltan variables de entorno: …` | Falta una variable en `.env` o en Vercel | Revisa `.env.example` y los nombres exactos |
| `CONFIGURATION_NOT_FOUND` al iniciar sesión | Authentication no está inicializado | Consola → Authentication → Comenzar |
| `PERMISSION_DENIED` / `SERVICE_DISABLED` | No se creó la base Firestore | Consola → Firestore → Crear base de datos |
| En Vercel, "Sesión inválida o expirada" con una cuenta real | `FIREBASE_PRIVATE_KEY` con comillas o `\n` mal copiado | Pégala sin comillas y haz Redeploy |
| El teléfono no llega a la API | La API escucha solo en `localhost`, o el firewall | `npm run dev:lan`, misma red Wi-Fi, abrir el puerto 3000 |
| `npm test` falla en `openapi.test.ts` | Agregaste/quitaste una ruta sin actualizar `lib/openapi.ts` | Documenta la ruta |
| Los emuladores no arrancan | Falta Java 21+ o los puertos 9099/8080 están ocupados | `java -version`; cierra lo que use esos puertos |

## Estructura

```
app/api/…            Route Handlers delgados: validan, delegan y responden
lib/domain/          Reglas puras (conflictos, referencias, categorías iniciales) — sin Firebase
lib/data/records.ts  Única capa que conoce Firestore (transacciones, lápidas, historial)
lib/services/        auth.ts (Firebase Auth) · resources.ts (manejadores compartidos de los 3 recursos)
lib/openapi.ts       Especificación OpenAPI generada desde los esquemas Zod
scripts/             create-user · reset-user · smoke
tests/               Vitest (con un Firestore en memoria en tests/helpers)
```
