/** Página de inicio mínima: este proyecto es una API; la interfaz es la app móvil. */
export default function Home() {
  return (
    <main>
      <h1>BolsilloAlDía · API</h1>
      <p>
        Servicio REST de la app móvil BolsilloAlDía. Autenticación con Firebase y sincronización de
        categorías, metas de ahorro y movimientos.
      </p>
      <ul>
        <li>
          <a href="/api/docs">Documentación interactiva (Swagger UI)</a>
        </li>
        <li>
          <a href="/api/openapi.json">Especificación OpenAPI</a>
        </li>
        <li>
          <a href="/api/health">Estado del servidor</a>
        </li>
      </ul>
    </main>
  );
}
