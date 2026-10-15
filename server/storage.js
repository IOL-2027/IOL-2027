// Where uploaded files (payment proofs, guardian consents) are kept.
// On Cloud Run the local disk is wiped on every restart, so production sets UPLOAD_BUCKET
// and files go to a private Cloud Storage bucket. Without it, files stay on local disk,
// which is what local development uses.
import fs from 'node:fs/promises'
import path from 'node:path'
import { Storage } from '@google-cloud/storage'

const bucketName = process.env.UPLOAD_BUCKET
const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'server/uploads')
const bucket = bucketName ? new Storage().bucket(bucketName) : null

/**
 * Store an uploaded file and return the value to keep in attachments.stored_path.
 * @param {string} key  - relative path, e.g. `<delegationId>/<file>.pdf`
 * @param {{ buffer: Buffer, mimetype: string }} file - the multer file
 */
export async function saveUpload(key, file) {
  if (bucket) {
    await bucket.file(key).save(file.buffer, {
      resumable: false,
      contentType: file.mimetype,
      metadata: { contentDisposition: 'attachment' },
    })
    return `gs://${bucketName}/${key}`
  }
  const storedPath = path.join(uploadDir, key)
  await fs.mkdir(path.dirname(storedPath), { recursive: true })
  await fs.writeFile(storedPath, file.buffer)
  return storedPath
}
