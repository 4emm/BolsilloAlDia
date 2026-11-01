import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root("./"),
      // `server-only` lanza error fuera de Next; en pruebas lo reemplazamos por un módulo vacío.
      "server-only": root("./tests/stubs/empty.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
