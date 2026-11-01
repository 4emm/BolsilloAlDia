# BolsilloAlDía

Aplicación de **finanzas personales y metas de ahorro** (Proyecto de aula N.º 5 · Desarrollo Móvil · Tecnológico de Antioquia).

El proyecto tiene dos partes:

- **`BolsilloAlDia_API`** — API REST con Next.js 16, Firebase Authentication y Cloud Firestore.
- **`BolsilloAlDia_APP`** — App móvil con Expo / React Native, SQLite y funcionamiento offline.

La app móvil **nunca habla directamente con Firebase**: todo pasa por la API.

## API en producción

- URL: <https://bolsilloaldia.vercel.app>
- Estado: <https://bolsilloaldia.vercel.app/api/health>
- Documentación Swagger: <https://bolsilloaldia.vercel.app/api/docs>
- OpenAPI: <https://bolsilloaldia.vercel.app/api/openapi.json>

## Estructura

```text
BolsilloAlDia_API/   API Next.js + Firebase Admin SDK
BolsilloAlDia_APP/   App móvil Expo + React Native
```

## Tecnologías

| Parte | Stack |
|---|---|
| API | Next.js 16, TypeScript, Zod, Firebase Admin SDK, Firestore, Vitest |
| App | Expo SDK 58, React Native, Expo Router, SQLite, SecureStore, NetInfo, dayjs, Jest |

## Cómo ejecutar

### API

```bash
cd BolsilloAlDia_API
npm install
cp .env.example .env   # completa las credenciales de Firebase
npm run dev            # http://localhost:3000
```

Documentación local: <http://localhost:3000/api/docs>

### App móvil

```bash
cd BolsilloAlDia_APP
npm install
cp .env.example .env   # configura EXPO_PUBLIC_API_URL
npx expo start
```

## Funcionalidades principales

- Registro, inicio y cierre de sesión.
- Categorías de gastos e ingresos con presupuesto mensual.
- Metas de ahorro con fecha límite y progreso.
- Registro, edición y eliminación de movimientos.
- Modo offline con SQLite y cola de sincronización.
- Sincronización idempotente: la última edición gana y borrar gana siempre.
- Estadísticas, filtros y alertas.

## Documentación

- [README de la API](BolsilloAlDia_API/README.md)
- [README de la app móvil](BolsilloAlDia_APP/README.md)

## Despliegue

- **API:** Vercel con **Root Directory = `BolsilloAlDia_API`**.
- Variables necesarias: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_WEB_API_KEY`.
- **App:** Expo Go para desarrollo o EAS Build para distribución.

## Seguridad

- Las credenciales de Firebase viven solo en el servidor.
- `.env` y las claves de servicio están fuera de Git.
- Las reglas de Firestore bloquean el acceso directo a `usuarios/**`.
