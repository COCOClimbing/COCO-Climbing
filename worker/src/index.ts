interface Env {
  BUCKET: R2Bucket;
  R2_PUBLIC_BASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

async function getUserId(auth: string, env: Env): Promise<string | null> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: auth,
        apikey: env.SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return null;
    const { id } = await res.json() as { id: string };
    return id ?? null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userId = await getUserId(auth, env);
    if (!userId) return new Response('Unauthorized', { status: 401 });

    // List all R2 keys belonging to this user (for orphan cleanup)
    if (request.method === 'GET') {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const listed = await env.BUCKET.list({ prefix: `${userId}/`, limit: 1000, ...(cursor ? { cursor } : {}) });
        keys.push(...listed.objects.map(o => o.key));
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
      return Response.json({ keys });
    }

    const path = url.searchParams.get('path');
    if (!path) return new Response('Missing path', { status: 400 });
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
