import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyIdToken = vi.fn();
vi.mock("@/lib/services/auth", () => ({ verifyIdToken: (t: string) => verifyIdToken(t) }));

import { requireUser } from "@/lib/guard";

const req = (authorization?: string) =>
  new Request("http://x/api", { headers: authorization ? { authorization } : {} });

beforeEach(() => verifyIdToken.mockReset());

describe("requireUser", () => {
  it("rechaza peticiones sin cabecera Authorization", async () => {
    await expect(requireUser(req())).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });
  it("rechaza esquemas distintos de Bearer", async () => {
    await expect(requireUser(req("Basic abc"))).rejects.toMatchObject({ status: 401 });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
  it("devuelve el usuario verificado", async () => {
    const user = { uid: "u1", email: "a@b.co", name: "Ana" };
    verifyIdToken.mockResolvedValue(user);
    await expect(requireUser(req("Bearer tok"))).resolves.toEqual(user);
    expect(verifyIdToken).toHaveBeenCalledWith("tok");
  });
});
