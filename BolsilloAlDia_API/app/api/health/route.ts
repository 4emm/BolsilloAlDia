/** Sirve para que la app compruebe que el servidor responde (sin tocar Firebase). */
export async function GET() {
  return Response.json({ status: "ok", service: "bolsillo_al_dia_api" });
}
