/**
 * Generate .jpg thumbnails for all exercise videos in GCS.
 *
 * Prerequisites:
 *   npm install @google-cloud/storage
 *   gcloud auth login   (or set GOOGLE_APPLICATION_CREDENTIALS)
 *   ffmpeg must be on PATH
 *
 * Usage:
 *   node scripts/generate-thumbnails.js
 *
 * This script:
 * 1. Lists all video files in gs://moveify-exercise-videos/
 * 2. For each video, downloads it to a temp file
 * 3. Extracts a frame at 0.5s using ffmpeg → .jpg
 * 4. Uploads the .jpg back to GCS at <video-name>.jpg
 * 5. Cleans up temp files
 */

const { Storage } = require('@google-cloud/storage');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BUCKET_NAME = 'moveify-exercise-videos';
const FRAME_TIME = '5'; // seconds into the video
const QUALITY = '5'; // ffmpeg jpg quality (2-31, lower = better)

async function main() {
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET_NAME);

  // List all files in the bucket
  const [files] = await bucket.getFiles();

  // Filter to video files (no extension = videos, skip .jpg files)
  const videos = files.filter(f => !f.name.endsWith('.jpg') && !f.name.endsWith('.png') && !f.name.includes('/'));
  console.log(`Found ${videos.length} videos in gs://${BUCKET_NAME}/`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moveify-thumbs-'));
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of videos) {
    const thumbName = `${file.name}.jpg`;

    // Check if thumbnail already exists
    const [exists] = await bucket.file(thumbName).exists();
    if (exists) {
      console.log(`  SKIP ${file.name} (thumbnail exists)`);
      skipped++;
      continue;
    }

    const videoPath = path.join(tmpDir, 'video');
    const thumbPath = path.join(tmpDir, 'thumb.jpg');

    try {
      // Download video
      console.log(`  Downloading ${file.name}...`);
      await file.download({ destination: videoPath });

      // Extract frame with ffmpeg
      execSync(
        `ffmpeg -y -ss ${FRAME_TIME} -i "${videoPath}" -frames:v 1 -q:v ${QUALITY} -vf "scale=320:-1" "${thumbPath}"`,
        { stdio: 'pipe' }
      );

      // Upload thumbnail
      await bucket.upload(thumbPath, {
        destination: thumbName,
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000',
        },
      });

      // Make it publicly readable
      await bucket.file(thumbName).makePublic();

      console.log(`  OK ${thumbName}`);
      generated++;
    } catch (err) {
      console.error(`  FAIL ${file.name}: ${err.message}`);
      failed++;
    } finally {
      // Clean up temp files
      try { fs.unlinkSync(videoPath); } catch {}
      try { fs.unlinkSync(thumbPath); } catch {}
    }
  }

  // Clean up temp dir
  try { fs.rmdirSync(tmpDir); } catch {}

  console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
