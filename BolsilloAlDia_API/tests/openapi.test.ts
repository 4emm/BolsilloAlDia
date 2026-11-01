import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { Validator } from "@seriousme/openapi-schema-validator";
import { describe, expect, it } from "vitest";
import { GET as getSpec } from "@/app/api/openapi.json/route";
import { buildOpenApiSpec } from "@/lib/openapi";

type Operation = { security?: unknown[]; responses: Record<string, unknown> };
type Spec = { openapi: string; paths: Record<string, Record<string, Operation>> };

const spec = buildOpenApiSpec() as unknown as Spec;
const METHODS = ["get", "post", "put", "patch", "delete"];

/** Rutas reales: todos los app/api/**\/route.ts con sus métodos HTTP exportados. */
function routesFromFiles(): Record<string, string[]> {
  const root = join(process.cwd(), "app", "api");
  const found: Record<string, string[]> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") {
        const urlPath =
          "/api/" +
          relative(root, dir)
            .split(sep)
            .filter(Boolean)
            .map((seg) => seg.replace(/^\[(.+)\]$/, "{$1}"))
            .join("/");
        const code = readFileSync(full, "utf8");
        const methods = [
          ...code.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g),
        ];
        found[urlPath.replace(/\/$/, "")] = methods.map((m) => m[1].toLowerCase()).sort();
      }
    }
  };
  walk(root);
  return found;
}

describe("especificación OpenAPI", () => {
  it("es un documento OpenAPI 3.1 válido", async () => {
    const result = await new Validator().validate(spec as never);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("documenta exactamente las rutas y métodos que existen en app/api (no se desfasa)", () => {
    const documented = Object.fromEntries(
      Object.entries(spec.paths).map(([path, ops]) => [
        path,
        Object.keys(ops)
          .filter((k) => METHODS.includes(k))
          .sort(),
      ]),
    );
    expect(documented).toEqual(routesFromFiles());
  });

  it("toda operación protegida declara Bearer y la respuesta 401", () => {
    const publicPaths = new Set([
      "/api/health",
      "/api/openapi.json",
      "/api/docs",
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/refresh",
    ]);
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        if (publicPaths.has(path)) {
          expect(op.security, `${method} ${path}`).toEqual([]);
        } else {
          expect(op.security, `${method} ${path}`).toEqual([{ bearerAuth: [] }]);
          expect(op.responses["401"], `${method} ${path} sin 401`).toBeDefined();
        }
      }
    }
  });

  it("los cuerpos de entrada salen de los esquemas Zod (reglas reales)", () => {
    const login = spec.paths["/api/auth/login"].post as unknown as {
      requestBody: {
        content: {
          "application/json": {
            schema: { required: string[]; properties: Record<string, { format?: string }> };
          };
        };
      };
    };
    const schema = login.requestBody.content["application/json"].schema;
    expect(schema.required).toEqual(expect.arrayContaining(["email", "password"]));
    expect(schema.properties.email.format).toBe("email");
    const put = JSON.stringify(spec.paths["/api/movements/{id}"].put);
    expect(put).toContain("clientUpdatedAt");
    expect(put).toContain("categoryId");
  });

  it("GET /api/openapi.json devuelve la especificación", async () => {
    const res = await getSpec();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Spec;
    expect(body.openapi).toMatch(/^3\.1/);
    expect(Object.keys(body.paths)).toContain("/api/movements/{id}");
  });
});
