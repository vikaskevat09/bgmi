/**
 * Cloudinary image storage (no SDK — signed upload via REST API).
 *
 * Why: Render's free disk is temporary, so files written locally vanish on
 * redeploy/restart. Uploading to Cloudinary keeps admin images permanent.
 *
 * Configure these env vars (from your Cloudinary dashboard):
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 * If they're missing, the server falls back to local file writes (dev mode).
 */
import crypto from 'crypto';

const {
  CLOUDINARY_CLOUD_NAME = '',
  CLOUDINARY_API_KEY = '',
  CLOUDINARY_API_SECRET = '',
} = process.env;

export function cloudEnabled() {
  return !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

/**
 * Upload a base64 data URL to Cloudinary at a fixed public_id (so re-uploads
 * overwrite the same image). Returns the permanent https URL.
 */
export async function uploadImage(dataUrl, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  // Params that get signed (alphabetical), excluding file/api_key/signature.
  const signed = { overwrite: 'true', public_id: publicId, timestamp: String(timestamp) };
  const toSign = Object.keys(signed).sort().map(k => `${k}=${signed[k]}`).join('&');
  const signature = crypto.createHash('sha1').update(toSign + CLOUDINARY_API_SECRET).digest('hex');

  const form = new URLSearchParams();
  form.set('file', dataUrl);
  form.set('api_key', CLOUDINARY_API_KEY);
  form.set('timestamp', String(timestamp));
  form.set('public_id', publicId);
  form.set('overwrite', 'true');
  form.set('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) {
    throw new Error((data.error && data.error.message) || 'Cloudinary upload failed');
  }
  // add a cache-busting version so the new image shows immediately
  return data.secure_url + (data.version ? `?v=${data.version}` : `?v=${timestamp}`);
}

/** Delete an image by public_id (best-effort; ignores errors). */
export async function destroyImage(publicId) {
  if (!cloudEnabled()) return;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `public_id=${publicId}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(toSign + CLOUDINARY_API_SECRET).digest('hex');
    const form = new URLSearchParams();
    form.set('public_id', publicId);
    form.set('api_key', CLOUDINARY_API_KEY);
    form.set('timestamp', String(timestamp));
    form.set('signature', signature);
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
      method: 'POST', body: form,
    });
  } catch { /* ignore */ }
}
