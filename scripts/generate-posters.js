/**
 * Generate side-by-side "poster" JPGs for exercise videos in GCS.
 *
 * For each video, extract two frames (at 25% and 75% of duration), composite
 * them side-by-side, and upload as <video-name>-poster.jpg. Used by the
 * printable program PDF so older patients can see the start + end positions
 * of each movement on paper.
 *
 * Prerequisites:
 *   npm install @google-cloud/storage   (already in scripts/package.json)
 *   gcloud auth login                   (or set GOOGLE_APPLICATION_CREDENTIALS)
 *   ffmpeg + ffprobe on PATH
 *
 * Usage:
 *   node scripts/generate-posters.js
 *   node scripts/generate-posters.js --force
 *   node scripts/generate-posters.js --only "Squat with Bodyweight" "Deadlift with Barbell"
 */

const { Storage } = require('@google-cloud/storage');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BUCKET_NAME = 'moveify-exercise-videos';
const FRAME_WIDTH = 640;
const QUALITY = '2';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const FORCE = process.argv.includes('--force');

const onlyIdx = process.argv.indexOf('--only');
const ONLY_NAMES = onlyIdx !== -1
  ? process.argv.slice(onlyIdx + 1).filter(a => !a.startsWith('--'))
  : null;

function probeDuration(videoPath) {
  const out = execSync(
    `"${FFPROBE}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    { encoding: 'utf8' }
  ).trim();
  const dur = parseFloat(out);
  if (!Number.isFinite(dur) || dur <= 0) throw new Error(`bad duration: ${out}`);
  return dur;
}

async function main() {
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET_NAME);

  const [files] = await bucket.getFiles();
  let videos = files.filter(f => !f.name.endsWith('.jpg') && !f.name.endsWith('.png') && !f.name.includes('/'));

  if (ONLY_NAMES) {
    const nameSet = new Set(ONLY_NAMES);
    videos = videos.filter(f => nameSet.has(f.name));
    console.log(`Targeting ${videos.length} of ${files.length} videos (--only filter)`);
  } else {
    console.log(`Found ${videos.length} videos in gs://${BUCKET_NAME}/`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moveify-posters-'));
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of videos) {
    const posterName = `${file.name}-poster.jpg`;

    if (!FORCE && !ONLY_NAMES) {
      const [exists] = await bucket.file(posterName).exists();
      if (exists) {
        console.log(`  SKIP ${file.name} (poster exists)`);
        skipped++;
        continue;
      }
    }

    const videoPath = path.join(tmpDir, 'video');
    const frame1Path = path.join(tmpDir, 'frame1.jpg');
    const frame2Path = path.join(tmpDir, 'frame2.jpg');
    const posterPath = path.join(tmpDir, 'poster.jpg');

    try {
      console.log(`  Downloading ${file.name}...`);
      await file.download({ destination: videoPath });

      const duration = probeDuration(videoPath);
      const t1 = (duration * 0.25).toFixed(2);
      const t2 = (duration * 0.50).toFixed(2);

      // HDR tonemap chain matches generate-thumbnails.js — handles iPhone HLG/DV
      // source while being a no-op on SDR. See that file for chain rationale.
      const vf = `zscale=t=linear:npl=500,format=gbrpf32le,zscale=p=bt709,tonemap=reinhard,zscale=t=bt709:m=bt709:r=tv,scale=${FRAME_WIDTH}:-1,format=yuv420p`;

      execSync(
        `"${FFMPEG}" -y -ss ${t1} -i "${videoPath}" -frames:v 1 -q:v ${QUALITY} -vf "${vf}" -update 1 "${frame1Path}"`,
        { stdio: 'pipe' }
      );
      execSync(
        `"${FFMPEG}" -y -ss ${t2} -i "${videoPath}" -frames:v 1 -q:v ${QUALITY} -vf "${vf}" -update 1 "${frame2Path}"`,
        { stdio: 'pipe' }
      );

      // Side-by-side composite. Both frames are already FRAME_WIDTH wide and
      // share aspect ratio (same source video), so hstack works without padding.
      execSync(
        `"${FFMPEG}" -y -i "${frame1Path}" -i "${frame2Path}" -filter_complex "hstack=inputs=2" -q:v ${QUALITY} "${posterPath}"`,
        { stdio: 'pipe' }
      );

      await bucket.upload(posterPath, {
        destination: posterName,
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000',
        },
      });

      console.log(`  OK ${posterName} (t1=${t1}s t2=${t2}s)`);
      generated++;
    } catch (err) {
      console.error(`  FAIL ${file.name}: ${err.message}`);
      failed++;
    } finally {
      try { fs.unlinkSync(videoPath); } catch {}
      try { fs.unlinkSync(frame1Path); } catch {}
      try { fs.unlinkSync(frame2Path); } catch {}
      try { fs.unlinkSync(posterPath); } catch {}
    }
  }

  try { fs.rmdirSync(tmpDir); } catch {}

  console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
