/** Versión fija de Swagger UI servida desde el CDN de jsDelivr. */
const SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.0";

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API de BolsilloAlDía · Documentación</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: "/api/openapi.json", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`;

/** GET /api/docs — documentación interactiva: lee /api/openapi.json y permite probar cada ruta. */
export async function GET() {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
