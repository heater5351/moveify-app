# Exercise Upload Guide

Instructions for adding new exercises to Moveify — from filming to production.

## 1. Video Upload to GCS

Upload `.mov` video files to `gs://moveify-exercise-videos/`.

### Naming Convention

Files must be renamed from camera names (e.g., `IMG_4499.mov`) to the exercise name in **Title Case with spaces**:

```
Standing Single Arm Bicep Curl With Cable Handle
```

**Pattern:** `[Modifier] [Movement] with [Equipment]`

- Movement comes first, equipment last after "with"
- Modifiers before the movement: `Single Leg`, `Elevated`, `Assisted`, `Lateral`, `Seated`, `Standing`, `Kneeling`, `Staggered`, `Ipsilateral`
- Title case throughout
- `with Bodyweight` for bodyweight exercises (not omitted)
- `with Dumbbells` (plural) but `with Dumbbell` (singular for single-arm)
- `with Barbell`, `with Resistance Band`, `with Kettlebell` (singular)
- `with Support` for assisted variations
- `with Cable Handle`, `with Cable Rope`, `with Cable Bar` for cable attachment types
- `with Machine` for machine exercises
- `+` combiner for compound movements: `Glute Bridge + Hip Abduction with Resistance Band`
- Parenthetical aliases for searchability: `Isometric Wall Squat (Wall Sit)`

### Renaming files in GCS

```bash
# Auth first if needed
gcloud auth login

# Copy to new name, then delete old
gcloud storage cp "gs://moveify-exercise-videos/IMG_XXXX.mov" "gs://moveify-exercise-videos/Exercise Name With Equipment"
gcloud storage rm "gs://moveify-exercise-videos/IMG_XXXX.mov"
```

Note: GCS video files have **no file extension** — this is intentional. The app references them without extensions.

## 2. Generate Thumbnails

After uploading and renaming videos, generate `.jpg` thumbnails.

### Settings

| Parameter | Value | Notes |
|-----------|-------|-------|
| Frame time | **5 seconds** | Captures a representative frame of the exercise in motion |
| Width | **640px** | Height auto-scaled. 320px was too blurry |
| JPEG quality | **2** | ffmpeg scale 2–31, lower = better |

### Run the script

```bash
# Prerequisites: ffmpeg on PATH, gcloud auth + application-default credentials
gcloud auth login
gcloud auth application-default login

# Generate thumbnails for new videos only (skips existing)
node scripts/generate-thumbnails.js

# Regenerate ALL thumbnails (e.g., after changing settings)
node scripts/generate-thumbnails.js --force
```

The script (`scripts/generate-thumbnails.js`):
1. Lists all video files in the bucket (files without `.jpg`/`.png` extension)
2. Skips videos that already have a `<name>.jpg` thumbnail (unless `--force`)
3. Downloads each video, extracts a frame with ffmpeg, uploads the `.jpg`

### Cache busting

Thumbnails are served with `?v=2` query param (see `LazyVideoCard.tsx` → `getThumbnailUrl`). If you regenerate thumbnails and they appear stale in the browser, bump the version number in that function.

## 3. Add Exercises to the Database

Add entries to `frontend/src/data/exercises.ts`.

### Exercise entry format

```typescript
{
  id: <next sequential ID>,
  name: 'Exercise Name with Equipment',
  category: 'Musculoskeletal',
  duration: '3 sets x 12 reps',        // Default prescription suggestion
  description: '<Clear, concise exercise instructions>',
  videoUrl: 'https://storage.googleapis.com/moveify-exercise-videos/<URL-encoded name>',
  jointArea: '<joint(s)>',
  muscleGroup: '<muscle(s)>',
  movementType: '<type(s)>',
  equipment: '<equipment filter value>',
  position: '<position>'
}
```

### Video URL encoding

The `videoUrl` must be the URL-encoded version of the GCS file name. Spaces become `%20`, `With` stays capitalised:

```
Name:     Standing Bicep Curl With Cable Rope
videoUrl: https://storage.googleapis.com/moveify-exercise-videos/Standing%20Bicep%20Curl%20With%20Cable%20Rope
```

### Filter Values

These must match the filter dropdown values in `AddExerciseModal.tsx`. Using non-matching values means the exercise won't appear when filtering.

#### Equipment (from `EQUIPMENT_OPTIONS`)

| Value | Use for |
|-------|---------|
| `Bodyweight` | No external load |
| `Dumbbells` | Dumbbell exercises (plural even for single arm) |
| `Barbell` | Barbell, trap bar, landmine |
| `Resistance Band` | Band exercises |
| `Machine` | Leg extension, hamstring curl, cable machines with fixed paths |
| `Kettlebell` | Kettlebell exercises |
| `Medicine Ball` | Medicine ball exercises |
| `Foam Roller` | Foam rolling / myofascial release |
| `Stability Ball` | Swiss ball exercises |
| `Cable` | Cable machine with handle, rope, or bar attachments |
| `Support` | Assisted variations (wall, chair, railing) |

**Important:** Cable exercises use `Cable` as the equipment value regardless of attachment (handle, rope, bar). The attachment type is part of the exercise name only.

#### Joint Area

Common values: `Hip`, `Knee`, `Ankle`, `Shoulder`, `Elbow`, `Spine`

Comma-separated for multi-joint: `Hip, Knee`, `Shoulder, Elbow`, `Spine, Hip, Shoulder`

#### Muscle Group

Common values: `Quadriceps`, `Glutes`, `Hamstrings`, `Calves`, `Deltoids`, `Biceps`, `Triceps`, `Chest`, `Core`, `Obliques`, `Rotator Cuff`, `Forearms`, `Latissimus Dorsi`, `Rhomboids`, `Lower Back`

Comma-separated for multiple: `Quadriceps, Glutes`, `Biceps, Forearms`, `Chest, Triceps, Deltoids`

#### Movement Type

| Value | Use for |
|-------|---------|
| `Flexion` | Bending / closing a joint angle |
| `Extension` | Straightening / opening a joint angle |
| `Flexion, Extension` | Full range through both phases (squats, lunges) |
| `Abduction` | Moving away from midline (lateral raises) |
| `Internal Rotation` | Rotating inward (shoulder IR exercises) |
| `External Rotation` | Rotating outward (shoulder ER exercises) |
| `Plantar Flexion` | Calf raises |
| `Isometric` | Static holds (wall sit, plank, isometric holds) |
| `Rotation` | Trunk/spine rotation (Russian twists, woodchoppers) |

Comma-separated for combined: `Extension, External Rotation`, `Flexion, Abduction`

#### Position

| Value | Use for |
|-------|---------|
| `Standing` | Upright on feet |
| `Seated` | Sitting on bench/machine |
| `Kneeling` | On knees |
| `Prone` | Face down (plank, push-up) |
| `Supine` | Face up (glute bridge, bench press) |
| `Side-lying` | On side (clamshell, side-lying hip abduction) |

## 4. Build & Deploy

```bash
# Verify build passes
cd frontend && npm run build

# Commit and push (auto-deploys via Vercel)
git add frontend/src/data/exercises.ts
git commit -m "Add [N] new exercises: [brief description]"
git push
```

## Quick Checklist

- [ ] Videos uploaded to `gs://moveify-exercise-videos/` with correct names (no file extension)
- [ ] Thumbnails generated: `node scripts/generate-thumbnails.js`
- [ ] Exercises added to `frontend/src/data/exercises.ts` with correct filters
- [ ] Video URLs are properly URL-encoded
- [ ] Equipment values match `EQUIPMENT_OPTIONS` in `AddExerciseModal.tsx`
- [ ] `npm run build` passes
- [ ] Committed and pushed
