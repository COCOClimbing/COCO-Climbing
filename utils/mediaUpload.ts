const WORKER_URL = 'https://coco-media.jacksonwalti.workers.dev';

export async function uploadMedia(
  uri: string,
  path: string,
  accessToken: string
): Promise<string> {
  const formData = new FormData();
  formData.append('file', { uri, name: 'upload.jpg', type: 'image/jpeg' } as any);

  const res = await fetch(`${WORKER_URL}/upload?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const { url } = await res.json();
  return url as string;
}

export async function deleteMedia(
  path: string,
  accessToken: string
): Promise<void> {
  await fetch(`${WORKER_URL}/delete?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function listMediaKeys(accessToken: string): Promise<string[]> {
  try {
    const res = await fetch(`${WORKER_URL}/list`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const { keys } = await res.json();
    return Array.isArray(keys) ? keys : [];
  } catch {
    return [];
  }
}
