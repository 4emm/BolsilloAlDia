/**
 * `fetch` mínimo sobre node:http para las pruebas de integración. El entorno de Jest de React Native
 * reemplaza el `fetch` global por uno de mentira, así que aquí se habla HTTP de verdad.
 */
import type { IncomingMessage } from 'node:http';

const http = process.getBuiltinModule('node:http');

export const nodeFetch = ((input: string | URL | Request, init?: RequestInit) =>
  new Promise<Response>((resolve, reject) => {
    const url = new URL(String(input));
    const req = http.request(
      url,
      { method: init?.method ?? 'GET', headers: init?.headers as Record<string, string> },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            json: async () => JSON.parse(text),
            text: async () => text,
          } as Response);
        });
      },
    );
    req.on('error', reject);
    init?.signal?.addEventListener('abort', () => req.destroy(new Error('abort')));
    if (typeof init?.body === 'string') req.write(init.body);
    req.end();
  })) as typeof fetch;
