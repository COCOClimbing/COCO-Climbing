import { Image as CompressorImage } from 'react-native-compressor';
import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const WORKER_URL = 'https://coco-media.jacksonwalti.workers.dev';

// True if the file exists, isn't empty, and decodes as an image. The
// compressor raises a native exception (not a JS error, so try/catch can't
// stop it) on files it can't open, which closes the whole app — Sentry
// REACT-NATIVE-W. Checking first keeps those files away from it.
async function canOpenImage(uri: string): Promise<boolean> {
  try {
    if (uri.startsWith('file://') || uri.startsWith('/')) {
      const info: any = await FileSystem.getInfoAsync(uri);
      if (!info.exists || !info.size) return false;
    }
    return await new Promise<boolean>(resolve => {
      Image.getSize(uri, (w, h) => resolve(w > 0 && h > 0), () => resolve(false));
    });
  } catch {
    return false;
  }
}

// Shrinks a photo to the same size the log-climb and session screens upload
// (1080px, 60% quality). Full-size phone photos are several MB and load
// seconds behind the rest of a post. Videos, files that can't be opened as
// images, and anything that fails to compress go up unchanged.
export async function shrinkPhotoForUpload(uri: string, type: 'photo' | 'video'): Promise<string> {
  if (type === 'video') return uri;
  if (!(await canOpenImage(uri))) return uri;
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
