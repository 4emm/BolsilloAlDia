import { parseBody, route } from "@/lib/http";
import { loginSchema } from "@/lib/schemas";
import { login } from "@/lib/services/auth";

export const POST = route(async (request) => {
  const { email, password } = await parseBody(request, loginSchema);
  return Response.json(await login(email, password));
});
