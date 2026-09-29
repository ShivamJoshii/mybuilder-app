import 'server-only'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Object storage over the S3 API. Production: Cloudflare R2. Local: Supabase Storage.
 * The browser uploads/downloads with short-lived signed URLs; access is decided in
 * Postgres (RLS on `files`) before any URL is signed.
 */
let client: S3Client | null = null
function s3() {
  client ??= new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '' },
  })
  return client
}
const bucket = () => process.env.STORAGE_BUCKET ?? 'files'

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

export function storageKey(orgId: string, jobId: string | null, fileId: string, version: number, name: string) {
  const safe = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(-120) || 'file'
  return `${orgId}/${jobId ?? 'global'}/${fileId}/v${version}/${safe}`
}

export async function signUpload(key: string, mime: string) {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime }), { expiresIn: 60 * 15 })
}

export async function signDownload(key: string, filename: string, inline = false) {
  const disposition = `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: disposition }), { expiresIn: 60 * 10 })
}

export async function headObject(key: string) {
  try {
    const h = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return { size: Number(h.ContentLength ?? 0), mime: h.ContentType ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

/** Stream an object through our own origin (used where the browser needs same-origin bytes, e.g. pdf.js). */
export async function getObjectStream(key: string) {
  const o = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
  return { body: o.Body?.transformToWebStream() ?? null, mime: o.ContentType ?? 'application/octet-stream', size: Number(o.ContentLength ?? 0) }
}
