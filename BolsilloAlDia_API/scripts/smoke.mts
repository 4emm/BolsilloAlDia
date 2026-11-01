/**
 * Prueba de humo de extremo a extremo contra la API en ejecución y Firebase REAL (o los emuladores).
 *   1) npm run dev            (o build + start)
 *   2) npm run smoke          (BASE_URL=http://localhost:3000 por defecto)
 * No necesita cuentas fijas: crea dos usuarios TEMPORALES con contraseñas aleatorias y los elimina
 * (junto con sus datos) al terminar.
 */
import { randomUUID } from "node:crypto";
import { deleteUserData, initAdmin } from "./_admin.mts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const RUN = Date.now();
const { auth, db } = initAdmin();

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  }
}

interface Res {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const password = () => `Aa1-${randomUUID()}`;
const iso = (offsetMin = 0) => new Date(Date.now() + offsetMin * 60_000).toISOString();
const createdUids: string[] = [];

async function main() {
  console.log(`\nProbando contra ${BASE}\n`);

  // ───────────── Autenticación ─────────────
  console.log("Autenticación");
  const health = await call("GET", "/api/health");
  check("GET /api/health responde ok", health.status === 200 && health.body?.status === "ok", health);
  check("sin token → 401", (await call("GET", "/api/movements")).status === 401);
  check("token falso → 401", (await call("GET", "/api/movements", "token-falso")).status === 401);

  const emailA = `smoke-a-${RUN}@example.com`;
  const passA = password();
  const reg = await call("POST", "/api/auth/register", undefined, {
    email: emailA,
    password: passA,
    displayName: "Smoke A",
  });
  check("registro → 201 con tokens", reg.status === 201 && !!reg.body?.tokens?.idToken, reg);
  createdUids.push(reg.body?.user?.uid);
  check(
    "registro repetido → 409 EMAIL_IN_USE",
    (await call("POST", "/api/auth/register", undefined, { email: emailA, password: passA, displayName: "X Y" }))
      .body?.error?.code === "EMAIL_IN_USE",
  );
  check(
    "registro con contraseña corta → 400",
    (await call("POST", "/api/auth/register", undefined, { email: "x@y.co", password: "123", displayName: "Xy" }))
      .status === 400,
  );
  const wrong = await call("POST", "/api/auth/login", undefined, { email: emailA, password: "mal-mal-mal" });
  check("login incorrecto → 401 INVALID_CREDENTIALS", wrong.status === 401 && wrong.body?.error?.code === "INVALID_CREDENTIALS", wrong);
  const login = await call("POST", "/api/auth/login", undefined, { email: emailA, password: passA });
  check("login correcto → 200", login.status === 200 && !!login.body?.tokens?.idToken, login);
  const refresh = await call("POST", "/api/auth/refresh", undefined, { refreshToken: login.body?.tokens?.refreshToken });
  check("refresh → idToken nuevo", refresh.status === 200 && !!refresh.body?.tokens?.idToken, refresh);
  const A: string = login.body.tokens.idToken;
  const me = await call("GET", "/api/auth/me", A);
  check("GET /api/auth/me devuelve el usuario", me.body?.user?.email === emailA, me);

  // ───────────── Categorías ─────────────
  console.log("Categorías");
  const cats = await call("GET", "/api/categories", A);
  check("la cuenta nueva trae 11 categorías iniciales", cats.body?.items?.length === 11, cats.body?.items?.length);
  const catId = `cat-${randomUUID()}`;
  const catBody = (over: object = {}) => ({
    name: "Gimnasio",
    type: "expense",
    monthlyBudget: 50000,
    createdAt: iso(-10),
    clientUpdatedAt: iso(-10),
    ...over,
  });
  check("PUT crea una categoría", (await call("PUT", `/api/categories/${catId}`, A, catBody())).body?.applied === true);
  const catEdit = await call("PUT", `/api/categories/${catId}`, A, catBody({ name: "Gym", clientUpdatedAt: iso(-5) }));
  check("PUT con edición más reciente la aplica", catEdit.body?.item?.name === "Gym", catEdit.body);
  const catStale = await call("PUT", `/api/categories/${catId}`, A, catBody({ name: "Vieja", clientUpdatedAt: iso(-8) }));
  check("PUT con edición más vieja se descarta (gana el servidor)", catStale.body?.applied === false && catStale.body?.item?.name === "Gym", catStale.body);
  check("nombre vacío → 400", (await call("PUT", `/api/categories/${catId}`, A, catBody({ name: "" }))).status === 400);
  check("id inválido → 400", (await call("PUT", "/api/categories/corto", A, catBody())).status === 400);

  // ───────────── Metas ─────────────
  console.log("Metas");
  const goalId = `meta-${randomUUID()}`;
  const goalBody = { name: "Portátil", targetAmount: 2_000_000, deadline: "2027-03-01", createdAt: iso(-9), clientUpdatedAt: iso(-9) };
  check("PUT crea una meta", (await call("PUT", `/api/goals/${goalId}`, A, goalBody)).body?.applied === true);
  check("meta con monto 0 → 400", (await call("PUT", `/api/goals/meta-00000000`, A, { ...goalBody, targetAmount: 0 })).status === 400);
  check("GET /api/goals lista la meta", (await call("GET", "/api/goals", A)).body?.items?.some((g: { id: string }) => g.id === goalId));

  // ───────────── Movimientos ─────────────
  console.log("Movimientos");
  const movId = randomUUID();
  const movBody = (over: object = {}) => ({
    amount: 2000,
    type: "expense",
    categoryId: "cat-transporte",
    goalId: null,
    date: "2026-10-12",
    note: "Bus a la U",
    createdAt: iso(-8),
    clientUpdatedAt: iso(-8),
    ...over,
  });
  // Un reintento real envía EXACTAMENTE el mismo cuerpo (misma clientUpdatedAt): se arma una sola vez.
  const sameBody = movBody();
  const first = await call("PUT", `/api/movements/${movId}`, A, sameBody);
  check("PUT crea un movimiento", first.status === 200 && first.body?.applied === true, first);
  const again = await call("PUT", `/api/movements/${movId}`, A, sameBody);
  check("el mismo PUT repetido no cambia nada (idempotencia)", again.body?.item?.updatedAt === first.body?.item?.updatedAt, again.body);
  const all = await call("GET", "/api/movements", A);
  check("solo existe UN movimiento tras reenviar", all.body?.items?.length === 1, all.body?.items?.length);
  for (const amount of [0, -3, 12.5, "2000"]) {
    check(`monto inválido (${JSON.stringify(amount)}) → 400`, (await call("PUT", `/api/movements/${randomUUID()}`, A, movBody({ amount }))).status === 400);
  }
  const ghostCat = await call("PUT", `/api/movements/${randomUUID()}`, A, movBody({ categoryId: "cat-no-existe" }));
  check("categoría inexistente → 409 INVALID_REFERENCE", ghostCat.status === 409 && ghostCat.body?.error?.code === "INVALID_REFERENCE", ghostCat);
  const wrongType = await call("PUT", `/api/movements/${randomUUID()}`, A, movBody({ type: "income" }));
  check("gasto en categoría de ingreso → 409", wrongType.status === 409, wrongType);
  const edit = await call("PUT", `/api/movements/${movId}`, A, movBody({ amount: 2500, clientUpdatedAt: iso(-3) }));
  check("edición más reciente aplicada", edit.body?.item?.amount === 2500, edit.body);
  const stale = await call("PUT", `/api/movements/${movId}`, A, movBody({ amount: 1, clientUpdatedAt: iso(-6) }));
  check("edición vieja descartada", stale.body?.applied === false && stale.body?.item?.amount === 2500, stale.body);

  const aporteId = randomUUID();
  const aporte = await call("PUT", `/api/movements/${aporteId}`, A, movBody({ categoryId: "cat-ahorro", goalId, amount: 100000 }));
  check("aporte a una meta existente → aplicado", aporte.body?.applied === true, aporte);
  const aporteFantasma = await call("PUT", `/api/movements/${randomUUID()}`, A, movBody({ categoryId: "cat-ahorro", goalId: "meta-fantasma" }));
  check("aporte a una meta inexistente → 409", aporteFantasma.status === 409, aporteFantasma);

  // ───────────── Borrado y sincronización incremental ─────────────
  console.log("Borrado y sincronización");
  const cursorBefore = (await call("GET", "/api/movements", A)).body.serverTime as string;
  await new Promise((r) => setTimeout(r, 15));
  const del = await call("DELETE", `/api/movements/${movId}`, A);
  check("DELETE → lápida", del.body?.item?.deleted === true && del.body?.applied === true, del.body);
  check("DELETE repetido es inofensivo", (await call("DELETE", `/api/movements/${movId}`, A)).body?.applied === false);
  const revive = await call("PUT", `/api/movements/${movId}`, A, movBody({ amount: 9999, clientUpdatedAt: iso(-1) }));
  check("una edición tardía NO revive el registro borrado", revive.body?.applied === false && revive.body?.item?.deleted === true, revive.body);
  check("GET del registro borrado → 404", (await call("GET", `/api/movements/${movId}`, A)).status === 404);
  const inc = await call("GET", `/api/movements?updatedSince=${encodeURIComponent(cursorBefore)}`, A);
  check(
    "updatedSince devuelve solo la lápida (lo que cambió)",
    inc.body?.items?.length === 1 && inc.body.items[0].id === movId && inc.body.items[0].deleted === true,
    inc.body,
  );
  check("updatedSince inválido → 400", (await call("GET", "/api/movements?updatedSince=ayer", A)).status === 400);
  const future = await call("GET", `/api/movements?updatedSince=${encodeURIComponent(iso(60))}`, A);
  check("updatedSince en el futuro → lista vacía", future.body?.items?.length === 0, future.body);

  // ───────────── Aislamiento entre usuarios ─────────────
  console.log("Aislamiento entre usuarios");
  const emailB = `smoke-b-${RUN}@example.com`;
  const passB = password();
  const regB = await call("POST", "/api/auth/register", undefined, { email: emailB, password: passB, displayName: "Smoke B" });
  createdUids.push(regB.body?.user?.uid);
  const B: string = regB.body.tokens.idToken;
  const listB = await call("GET", "/api/movements", B);
  check("otro usuario no ve mis movimientos", listB.body?.items?.length === 0, listB.body);
  check("otro usuario no puede pedir mi movimiento por id (404)", (await call("GET", `/api/movements/${aporteId}`, B)).status === 404);
  const intruso = await call("PUT", `/api/movements/${aporteId}`, B, movBody({ amount: 1 }));
  check("si B escribe el mismo id, crea el SUYO sin tocar el de A", intruso.status === 200);
  check("el movimiento de A sigue intacto", (await call("GET", `/api/movements/${aporteId}`, A)).body?.item?.amount === 100000);
}

try {
  await main();
} catch (err) {
  failed++;
  console.error("\nLa prueba se interrumpió:", err);
} finally {
  for (const uid of createdUids.filter(Boolean)) {
    await deleteUserData(db, uid).catch(() => {});
    await db.collection("usuarios").doc(uid).delete().catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log(`\n${passed} correctas, ${failed} con error. (Usuarios de prueba eliminados.)`);
  process.exit(failed === 0 ? 0 : 1);
}
