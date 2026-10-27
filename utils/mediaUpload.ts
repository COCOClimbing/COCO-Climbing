import { Image as CompressorImage } from 'react-native-compressor';

const WORKER_URL = 'https://coco-media.jacksonwalti.workers.dev';

// Shrinks a photo to the same size the log-climb and session screens upload
// (1080px, 60% quality). Full-size phone photos are several MB and load
// seconds behind the rest of a post. Videos, and anything that fails to
// compress, go up unchanged.
export async function shrinkPhotoForUpload(uri: string, type: 'photo' | 'video'): Promise<string> {
  if (type === 'video') return uri;
  try {
    return await CompressorImage.compress(uri, { quality: 0.6, maxWidth: 1080, maxHeight: 1080 });
  } catch {
    return uri;
  }
}

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
