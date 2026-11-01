import { ApiRequestError, NetworkError, createApiClient, describeError } from '@/services/api/client';
import { SessionManager, type SecureStorage } from '@/services/auth/session-manager';
import { validateCredentials } from '@/services/auth/auth-service';
import type { AuthResult } from '@/types';

class MemoryStorage implements SecureStorage {
  data = new Map<string, string>();
  async getItemAsync(k: string) {
    return this.data.get(k) ?? null;
  }
  async setItemAsync(k: string, v: string) {
    this.data.set(k, v);
  }
  async deleteItemAsync(k: string) {
    this.data.delete(k);
  }
}

const result = (idToken: string, expiresIn = 3600): AuthResult => ({
  tokens: { idToken, refreshToken: 'refresh-1', expiresIn },
  user: { uid: 'u1', email: 'a@b.co', name: 'Ana' },
});

describe('SessionManager', () => {
  it('guarda la sesión y la restaura tras reiniciar la app (sin red)', async () => {
    const storage = new MemoryStorage();
    await new SessionManager(storage, { post: jest.fn() }).save(result('tok-1'));
    const restarted = new SessionManager(storage, { post: jest.fn() });
    expect(await restarted.restore()).toMatchObject({ uid: 'u1' });
    expect(await restarted.getAccessToken()).toBe('tok-1');
  });

  it('cada token vive en su propia llave y la contraseña nunca se guarda', async () => {
    const storage = new MemoryStorage();
    await new SessionManager(storage, { post: jest.fn() }).save(result('tok-1'));
    expect([...storage.data.keys()].sort()).toEqual(['auth.expiresAt', 'auth.idToken', 'auth.refreshToken', 'auth.user']);
    expect(JSON.stringify([...storage.data.values()])).not.toMatch(/password|contraseña/i);
  });

  it('clear() borra todo y avisa a los suscriptores (las rutas protegidas reaccionan)', async () => {
    const storage = new MemoryStorage();
    const session = new SessionManager(storage, { post: jest.fn() });
    const seen: unknown[] = [];
    session.subscribe((u) => seen.push(u));
    await session.save(result('tok-1'));
    await session.clear();
    expect(storage.data.size).toBe(0);
    expect(seen).toEqual([expect.objectContaining({ uid: 'u1' }), null]);
  });

  it('renueva el token un minuto antes de que venza', async () => {
    let now = 1_000_000;
    const post = jest.fn().mockResolvedValue(result('tok-2'));
    const session = new SessionManager(new MemoryStorage(), { post }, () => now);
    await session.save(result('tok-1', 3600));
    expect(await session.getAccessToken()).toBe('tok-1');
    now += 3600 * 1000 - 30_000; // faltan 30 s
    expect(await session.getAccessToken()).toBe('tok-2');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('varias renovaciones simultáneas comparten una sola petición', async () => {
    const post = jest.fn().mockResolvedValue(result('tok-2'));
    const session = new SessionManager(new MemoryStorage(), { post });
    await session.save(result('tok-1'));
    await Promise.all([session.refresh(), session.refresh(), session.refresh()]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('sin red NO cierra la sesión; con 401 del servidor sí', async () => {
    const offline = new SessionManager(new MemoryStorage(), { post: jest.fn().mockRejectedValue(new NetworkError()) });
    await offline.save(result('tok-1'));
    expect(await offline.refresh()).toBe(false);
    expect(offline.getUser()).not.toBeNull();

    const revoked = new SessionManager(new MemoryStorage(), {
      post: jest.fn().mockRejectedValue(new ApiRequestError(401, 'INVALID_CREDENTIALS', 'x')),
    });
    await revoked.save(result('tok-1'));
    expect(await revoked.refresh()).toBe(false);
    expect(revoked.getUser()).toBeNull();
  });
});

describe('cliente HTTP', () => {
  const json = (status: number, body: unknown) =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
  const make = (fetchImpl: jest.Mock, auth?: Parameters<typeof createApiClient>[0]['auth']) =>
    createApiClient({ baseUrl: 'http://api', timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch, auth });

  it('envía el token Bearer y el cuerpo JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(json(200, { ok: true }));
    const api = make(fetchImpl, { getAccessToken: async () => 'tok', refreshSession: async () => false });
    await api.put('/api/movements/abc', { amount: 1 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://api/api/movements/abc');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ amount: 1 });
  });

  it('distingue "sin red" (NetworkError) de "el servidor respondió con error" (ApiRequestError)', async () => {
    await expect(make(jest.fn().mockRejectedValue(new TypeError('x'))).get('/a')).rejects.toBeInstanceOf(NetworkError);
    const err = await make(jest.fn().mockResolvedValue(json(409, { error: { code: 'INVALID_REFERENCE', message: 'm' } })))
      .put('/a', {})
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 409, code: 'INVALID_REFERENCE' });
  });

  it('ante un 401 renueva la sesión y reintenta una sola vez', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    let token = 'viejo';
    const api = make(fetchImpl, {
      getAccessToken: async () => token,
      refreshSession: async () => {
        token = 'nuevo';
        return true;
      },
    });
    await expect(api.get('/a')).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer nuevo');
  });

  it('describeError da mensajes en español', () => {
    expect(describeError(new NetworkError())).toMatch(/No hay conexión/);
    expect(describeError(new ApiRequestError(400, 'VALIDATION_ERROR', 'Monto inválido'))).toBe('Monto inválido');
    expect(describeError(new Error('x'))).toMatch(/inesperado/);
  });
});

describe('validateCredentials', () => {
  it('valida registro e inicio de sesión', () => {
    expect(validateCredentials({ email: 'a@b.co', password: '123456', name: 'Ana' }, 'signUp')).toEqual({});
    expect(validateCredentials({ email: 'mal', password: '123', name: 'A' }, 'signUp')).toEqual({
      name: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
    });
    expect(validateCredentials({ email: 'a@b.co', password: '' }, 'signIn').password).toBeDefined();
    expect(validateCredentials({ email: 'a@b.co', password: 'x' }, 'signIn')).toEqual({});
  });
});
