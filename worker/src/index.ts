interface Env {
  BUCKET: R2Bucket;
  SUPABASE_JWT_SECRET: string;
  R2_PUBLIC_BASE_URL: string;
}

function base64urlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function verifyJWT(token: string, secret: string): Promise<string | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBytes(signature),
      new TextEncoder().encode(`${header}.${payload}`)
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload)));
    if (claims.exp && claims.exp < Date.now() / 1000) return null;
    return claims.sub ?? null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    if (!path) return new Response('Missing path', { status: 400 });

    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userId = await verifyJWT(auth.slice(7), env.SUPABASE_JWT_SECRET);
    if (!userId) return new Response('Unauthorized', { status: 401 });
    if (!path.startsWith(`${userId}/`)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'POST') {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) return new Response('Missing file', { status: 400 });

      await env.BUCKET.put(path, file.stream(), {
        httpMetadata: { contentType: 'image/jpeg' },
      });

      return Response.json({ url: `${env.R2_PUBLIC_BASE_URL}/${path}` });
    }

    if (request.method === 'DELETE') {
      await env.BUCKET.delete(path);
      return new Response(null, { status: 204 });
    }

    return new Response('Method not allowed', { status: 405 });
  },
};
