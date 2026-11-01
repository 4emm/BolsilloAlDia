import type { NextConfig } from "next";

/**
 * CORS para /api/*: la app también puede abrirse desde otro dominio
 * (por ejemplo el despliegue web de Expo). La autenticación va por Bearer,
 * no por cookies, así que `*` es seguro aquí.
 */
const corsHeaders = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
  { key: "Access-Control-Max-Age", value: "86400" },
];

/** Rutas que NO son de la app web: la API y los archivos que sirve Next.js. */
const API_OR_ASSET =
  "(?!api(?:/|$)|_next(?:/|$)|_expo(?:/|$)|assets(?:/|$)|index\\.html$|favicon\\.ico$|metadata\\.json$)";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,

  async rewrites() {
    return {
      beforeFiles: [
        // La app web (export de Expo) vive en public/ y se sirve en la raíz.
        // Las rutas del SPA (/sign-in, /movement/123…) se resuelven en el navegador
        // cargando index.html; /api/* y los archivos estáticos no se tocan.
        { source: `/:path(${API_OR_ASSET}.*)`, destination: "/index.html" },
        { source: "/", destination: "/index.html" },
      ],
    };
  },

  async headers() {
    return [
      {
        // expo-sqlite en web usa WebAssembly + SharedArrayBuffer:
        // el navegador exige aislamiento de origen (COOP + COEP).
        source: `/:path(${API_OR_ASSET}.*)`,
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        source: "/",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      { source: "/api/:path*", headers: corsHeaders },
    ];
  },
};

export default nextConfig;
