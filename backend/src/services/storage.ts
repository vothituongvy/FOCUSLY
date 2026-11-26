import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

const useCloudinary = Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

export interface StoredFile {
  url: string;
  publicId: string;
}

/** Lưu avatar: Cloudinary nếu đã cấu hình, ngược lại lưu local trong /uploads */
export async function storeAvatar(buffer: Buffer, mime: string, userId: string): Promise<StoredFile> {
  if (useCloudinary) {
    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'focusly/avatars',
          public_id: `${userId}-${Date.now()}`,
          transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }],
        },
        (err, res) => (err || !res ? reject(err) : resolve(res)),
      );
      stream.end(buffer);
    });
    return { url: result.secure_url, publicId: `cloudinary:${result.public_id}` };
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const name = `${userId}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await fs.mkdir(path.join(UPLOAD_DIR, 'avatars'), { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, 'avatars', name), buffer);
  return { url: `${env.publicApiUrl}/uploads/avatars/${name}`, publicId: `local:${name}` };
}

/** Lưu file tài liệu học (PDF, ảnh, văn bản). Cloudinary: resource_type raw/image */
export async function storeMaterialFile(buffer: Buffer, mime: string, userId: string, originalName: string): Promise<StoredFile> {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file';
  if (useCloudinary) {
    const isImage = mime.startsWith('image/');
    const result = await new Promise<{ secure_url: string; public_id: string; resource_type: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `focusly/materials/${userId}`,
          resource_type: isImage ? 'image' : 'raw',
          public_id: `${Date.now()}-${safe}`,
        },
        (err, res) => (err || !res ? reject(err) : resolve(res)),
      );
      stream.end(buffer);
    });
    return { url: result.secure_url, publicId: `cloudinary-${result.resource_type}:${result.public_id}` };
  }
  const dir = path.join(UPLOAD_DIR, 'materials', userId);
  await fs.mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
  await fs.writeFile(path.join(dir, name), buffer);
  return { url: `${env.publicApiUrl}/uploads/materials/${userId}/${encodeURIComponent(name)}`, publicId: `localmat:${userId}/${name}` };
}

export async function removeStored(publicId?: string | null): Promise<void> {
  if (!publicId) return;
  try {
    if (publicId.startsWith('cloudinary-') && useCloudinary) {
      const [kind, id] = publicId.slice('cloudinary-'.length).split(/:(.*)/s);
      await cloudinary.uploader.destroy(id, { resource_type: kind });
    } else if (publicId.startsWith('localmat:')) {
      const rel = publicId.slice('localmat:'.length);
      const [uid, file] = rel.split('/');
      await fs.unlink(path.join(UPLOAD_DIR, 'materials', path.basename(uid), path.basename(file)));
    } else if (publicId.startsWith('cloudinary:') && useCloudinary) {
      await cloudinary.uploader.destroy(publicId.slice('cloudinary:'.length));
    } else if (publicId.startsWith('local:')) {
      await fs.unlink(path.join(UPLOAD_DIR, 'avatars', path.basename(publicId.slice(6))));
    }
  } catch (e) {
    console.warn('[storage] Không xoá được file cũ', e);
  }
}
