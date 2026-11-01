# BolsilloAlDía · App móvil

Aplicación móvil de **finanzas personales y metas de ahorro** (Proyecto de aula N.º 5 · Desarrollo Móvil · Tecnológico de
Antioquia). Permite registrar gastos e ingresos por categoría en el momento en que ocurren, **también sin conexión**,
definir metas de ahorro con fecha límite, ver el progreso y recibir alertas.

- **React Native + Expo** (SDK 58, Expo Router, TypeScript) · **SQLite** (`expo-sqlite`) · **dayjs** · **NetInfo** · **SecureStore**
- Backend: [`BolsilloAlDia_API`](../BolsilloAlDia_API) (Next.js + **Firebase Authentication** + **Firestore**). La app habla solo con
  esa API, no con Firebase directamente (arquitectura de la Guía 2).

> **Estado de la entrega.** Están implementadas todas las funcionalidades base de los tres entregables. Quedan pendientes lo
> que depende del trabajo de campo del equipo: **la investigación en el campus (hallazgos H-03 y H-04) y, por tanto, las
> Funcionalidades Emergentes FE-01 y FE-02**. Ver [Trazabilidad](#trazabilidad-investigación--producto).

## Funcionalidades

| # | Funcionalidad | Dónde |
|---|---|---|
| 1 | Registro, inicio y cierre de sesión (Firebase Auth vía API) | `src/app/sign-in.tsx`, `sign-up.tsx`, `src/services/auth` |
| 2 | Categorías (nombre, tipo, presupuesto mensual) y metas (nombre, monto objetivo, fecha límite) con validación | `src/app/category/[id].tsx`, `goal/[id].tsx`, `src/domain/validation.ts` |
| 3 | Listado de categorías, metas y movimientos del usuario autenticado | `categories.tsx`, pestañas *Metas* y *Movimientos* |
| 4 | Registro de movimientos: monto, categoría, tipo, fecha, nota. **Monto → categoría → Guardar** | `src/app/movement/[id].tsx` |
| 5 | Editar y eliminar movimientos, categorías y metas, con confirmación | las mismas pantallas |
| 6 | Historial por categoría y por rango de fechas, y filtros por categoría, tipo, periodo y estado de la meta | pestañas *Movimientos* y *Metas* |
| 7 | Resumen: total por categoría, saldo del periodo, % de avance de cada meta | pestaña *Inicio* |
| 8 | **Modo offline**: caché local, totales locales, indicador de conexión permanente, cola de pendientes | ver [Offline](#estrategia-offline-first) |
| 9 | Panel de estadísticas: cumplimiento semanal y mensual, distribución del gasto, evolución del saldo | pestaña *Estadísticas* |
| 10 | Metas con estado automático: activa, cumplida, vencida (incluso sin conexión) | `src/domain/goals.ts` |
| 11 | Sincronización idempotente sin duplicados, con regla de conflictos documentada | `src/services/sync` |
| 12 | Alertas dentro de la app: meta por vencer, meta cumplida, presupuesto superado, estado de sincronización | `src/domain/alerts.ts` |

## Cómo ejecutarla

Requisitos: Node.js 22+, npm, la app **Expo Go** en el teléfono (misma red Wi-Fi que el computador) y la API corriendo.

```bash
# 1) La API (en BolsilloAlDia_API) — ver su README para configurar Firebase o los emuladores
npm run dev:lan

# 2) La app (en esta carpeta)
npm install
cp .env.example .env          # en PowerShell: Copy-Item .env.example .env
npx expo start                # escanea el QR con Expo Go
```

`EXPO_PUBLIC_API_URL` (en `.env`) debe ser `http://IP-DE-TU-PC:3000` en un teléfono físico, `http://10.0.2.2:3000` en el
emulador de Android o `http://localhost:3000` en el simulador de iOS. Tras cambiarla: `npx expo start -c`. En producción la API
debe servirse por HTTPS.

### Credenciales de prueba para el docente

Crea la cuenta con el script de la API (con tus propias credenciales de Firebase) y escríbela aquí antes de entregar:

```bash
# en BolsilloAlDia_API
npm run create-user -- docente@ejemplo.com "ClaveDeLaPrueba1" "Docente TdeA"
```

| Correo | Contraseña |
|---|---|
| _(completar antes de entregar)_ | _(completar antes de entregar)_ |

## Arquitectura

```
src/
  app/            Pantallas y navegación (Expo Router): sign-in, (tabs)/…, movement/[id], goal/[id], category/[id], …
  components/     Interfaz reutilizable: Screen (con el indicador de conexión), Button, TextField, charts, …
  domain/         ★ Lógica de negocio PURA (sin red ni SQLite): dinero, periodos, resumen, metas, alertas, estadísticas, validación
  db/             SQLite: migraciones (PRAGMA user_version) y repositorios (TODA la SQL vive aquí)
  services/
    api/          Cliente HTTP (NetworkError vs ApiRequestError, renovación del token en 401)
    auth/         Sesión segura (SecureStore) y servicio de autenticación
    data/         Escrituras "local primero": guardan en SQLite + cola en una sola transacción
    sync/         Motor de sincronización (cola → servidor, servidor → SQLite)
  providers/      AuthProvider (sesión) y DataProvider (datos locales + cuándo sincronizar)
  hooks/ lib/ config/ constants/ types/
__tests__/        Jest: dominio, SQLite + sincronización, pantallas, sesión y cliente HTTP
test-utils/       SQLite real en Node (node:sqlite) y un servidor falso con las reglas de la API
```

**¿Dónde se calculan los totales? En el dispositivo.** Las pantallas leen SQLite (vía `DataProvider`) y llaman a las funciones
puras de `src/domain` (`summarize`, `totalsByCategory`, `goalProgress`, `budgetCompliance`, …). El servidor nunca calcula ni
devuelve totales.

### Almacenamiento local

| Dónde | Qué | Con qué |
|---|---|---|
| SQLite `bolsillo.db` | `categories`, `goals`, `movements` (con `sync_state` y `client_updated_at`), `outbox` (cola), `sync_meta` (cursores, última sincronización, dueño de los datos), `activity_log` | `expo-sqlite` |
| Almacenamiento seguro (Keychain/Keystore) | `idToken`, `refreshToken`, expiración y usuario, cada uno en su llave | `expo-secure-store` |

La contraseña **nunca** se guarda. Todos los datos de SQLite pertenecen a la cuenta autenticada y **se borran al cerrar
sesión** (o al entrar otro usuario).

## Estrategia offline-first

1. **La interfaz siempre lee y escribe en SQLite**; nunca espera a la red. Sin conexión se puede registrar, editar, eliminar,
   consultar el historial, filtrar y ver todos los totales, porque se calculan con los datos locales.
2. **Cada cambio** (crear/editar/eliminar) se guarda en SQLite y se anota en la tabla `outbox` **en una sola transacción**: nunca
   queda un cambio sin su entrada en la cola, aunque la app se cierre.
3. **Indicador permanente** de conexión en la parte superior de todas las pantallas: sin conexión / sincronizando / N cambios
   por enviar / sincronizado hace X. Cada registro pendiente lleva la etiqueta *Pendiente de envío*.
4. La cola se envía **automáticamente** al volver la red (NetInfo), al volver la app a primer plano, tras cada cambio y al
   deslizar para refrescar; o a mano en *Más → Sincronización*, donde también se ve el número de pendientes, la última
   sincronización exitosa, los errores y la actividad reciente.
5. Orden de envío: primero categorías y metas, después movimientos, luego se borran movimientos y al final categorías y metas
   (así el servidor nunca recibe un movimiento antes que su categoría). Dentro de cada grupo, por orden de llegada.
6. Descarga **incremental**: un cursor `updatedSince` por tipo de registro (con 1 s de solape; el guardado es idempotente).

### Idempotencia: un movimiento aparece una sola vez

- El `id` de cada registro es un **UUID generado en el teléfono al crearlo** (`expo-crypto`) y **no cambia nunca**.
- El envío es `PUT /api/movements/<id>`: la API usa ese `id` como id del documento en Firestore. Reenviar el mismo registro
  (app cerrada y reabierta, respuesta perdida, varias sincronizaciones) cae sobre el mismo documento; un reintento idéntico ni
  siquiera se escribe.
- La entrada de la cola solo se quita **después** de que el servidor responde OK. Si la respuesta se pierde, la entrada sigue
  ahí y se reenvía sin duplicar.
- Varias ediciones seguidas de un registro pendiente viajan como **una sola** petición (la cola guarda *qué* cambió, no una
  copia del cambio; al enviar se lee la versión más reciente).

### Regla de resolución de conflictos

> **La última edición gana, y borrar gana siempre.** (Definición completa y justificación en el README de la API.)

- Cada cambio lleva `clientUpdatedAt`. Si el servidor ya tiene una edición **más reciente**, conserva la suya y la app la adopta.
- Un registro eliminado no se revive: si otro dispositivo lo borró, aquí se borra su copia local aunque tenga una edición pendiente.
- Lo local **con cambios pendientes no se pisa** al descargar: los totales no cambian solos después de sincronizar.
- Si el servidor **rechaza** un registro (p. ej. su categoría fue eliminada desde otro dispositivo → `409 INVALID_REFERENCE`),
  queda marcado *No se pudo sincronizar* con el motivo, **no cuenta en los totales** y el usuario puede *Reintentar* o
  *Descartar*. No se pierde sin avisar y no bloquea al resto de la cola.
- Errores 5xx/429: la entrada se queda en la cola, se cuenta el intento y se reintenta; tras 5 intentos se informa como rechazada.
- Eliminar una categoría elimina también sus movimientos (se confirma antes); eliminar una meta conserva sus aportes como gastos.

### Cómo probar el modo avión (para la sustentación)

1. Inicia sesión con conexión. Verás el indicador verde *En línea · Sincronizado*.
2. Activa el **modo avión**. El indicador pasa a *Sin conexión · Tus datos están guardados en el teléfono*.
3. Registra un gasto (**Registrar → monto → categoría → Guardar**), edita otro, elimina otro, consulta el historial y filtra.
   Los totales de *Inicio* y *Estadísticas* cambian al instante. Los registros muestran *Pendiente de envío*; el indicador cuenta
   los cambios por enviar.
4. Cierra la app del todo y ábrela de nuevo (sigue en modo avión): todo está ahí.
5. Desactiva el modo avión: en unos segundos la cola se envía, las etiquetas desaparecen y el indicador vuelve a verde.
6. En *Más → Sincronización* pulsa **Sincronizar ahora** varias veces: el gasto sigue apareciendo **una sola vez**.

## Metas: estado automático

El estado **no se guarda**: se calcula cada vez con lo ahorrado y la fecha de hoy del teléfono (`src/domain/goals.ts`).

| Condición | Estado |
|---|---|
| lo ahorrado ≥ monto objetivo | **Cumplida** |
| si no, la fecha límite es anterior a hoy | **Vencida** |
| si no | **Activa** |

Por eso una meta pasa de activa a vencida aunque la app lleve una semana sin abrirse y no haya conexión: al abrirla se
recalcula. Los **aportes** son gastos marcados como "aporte a una meta" al registrarlos (o con *Abonar a esta meta*).

## Alertas (reglas)

| Alerta | Regla |
|---|---|
| Meta próxima a vencer | Activa y le faltan 7 días o menos |
| Meta cumplida | Lo ahorrado alcanzó el objetivo |
| Meta vencida | Pasó la fecha límite sin alcanzar el objetivo |
| Presupuesto superado | En el mes en curso, el gasto de la categoría supera su presupuesto mensual |
| Presupuesto casi agotado | Ya se usó el 80 % o más (sin superarlo) |
| Sincronización | Cambios pendientes, último intento con error, o registros rechazados |

## Estadísticas: cómo se calcula el cumplimiento

`cumplimiento = categorías de gasto con presupuesto cuyo gasto ≤ presupuesto ÷ categorías de gasto con presupuesto`.
El presupuesto es mensual; para la **semana** se prorratea (`presupuesto × 7 ÷ días del mes`). Sin presupuestos definidos, el
panel lo indica en vez de mostrar un 0 %.

## Pruebas

```bash
npm test            # 100 pruebas (Jest): dominio, SQLite real, sincronización, pantallas, sesión, cliente HTTP
npm run typecheck   # TypeScript
npx expo lint       # ESLint
```

- `__tests__/offline-sync.test.ts` responde a las preguntas de la sustentación con SQL real: registrar sin conexión, cerrar y
  reabrir la app, sincronizar varias veces (¿cuántas veces aparece el gasto?), respuesta perdida, borrados que no resucitan,
  conflictos, reintentos y orden de envío.
- `__tests__/e2e-api.test.ts` ejecuta la app real contra la API real (2 teléfonos, ediciones, borrados, conflictos). Solo corre
  si defines la URL:
  ```powershell
  # con los emuladores y `npm run dev` corriendo en BolsilloAlDia_API
  $env:E2E_API_URL="http://localhost:3000"; npm test -- e2e-api
  ```

## Trazabilidad: investigación → producto

La investigación de campo en el campus (entrevistas, observación, fotos, backlog) **la debe hacer el equipo**: no se puede
inventar. Las plantillas están en [`docs/investigacion`](docs/investigacion/README.md).

| Cód. | Hallazgo en campo | Requisito derivado | Entregable | Estado |
|---|---|---|---|---|
| H-01 | El estudiante no sabe en qué se le va la plata del mes y lleva las cuentas de memoria | Registro rápido de movimientos por categoría con resumen visible | 1.º | Implementado: `movement/[id].tsx`, pestaña *Inicio* |
| H-02 | Los gastos ocurren fuera del campus y en sitios sin señal, así que nunca se anotan a tiempo | Registro y cálculo totalmente offline con sincronización idempotente | 2.º y 3.º | Implementado: `src/db`, `src/services/sync` |
| H-03 | _(hallazgo propio del equipo)_ | **FE-01** | 2.º | **Pendiente**: definir tras la investigación |
| H-04 | _(hallazgo propio del equipo)_ | **FE-02** | 3.º | **Pendiente**: definir tras la investigación |

Cuando el equipo defina FE-01 y FE-02, documenta aquí en un párrafo cada una: qué problema resuelve, quién lo reportó y cómo
se implementó (con la ruta del código), como exige el enunciado.

## Decisiones y límites conocidos

- **Montos en pesos enteros**: las sumas son exactas y el registro es más rápido (sin coma decimal).
- **Gráficas hechas con vistas** (sin librerías nativas): funcionan en Expo Go, sin conexión y con lectores de pantalla.
- **Fechas AAAA-MM-DD en hora local**: "el gasto de hoy" cae en el día correcto sin importar la zona horaria.
- Iniciar sesión y crear la cuenta **requieren conexión** (la autenticación es del servidor); después todo funciona sin red.
- Para compilar un instalable (EAS) hay que cambiar `co.edu.tdea.bolsilloaldia` por un identificador propio en `app.json` y
  usar una API con HTTPS.
