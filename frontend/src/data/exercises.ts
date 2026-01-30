import type { Exercise } from '../types/index.ts';

export const exercises: Exercise[] = [
  // Squat Variations
  {
    id: 1,
    name: 'Bodyweight Squat',
    category: 'Lower Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Feet shoulder-width apart, toes slightly out. Push hips back, bend knees to lower down. Keep chest up, weight in heels. Drive through heels to stand. Knees track over toes throughout.'
  },
  {
    id: 2,
    name: 'Goblet Squat',
    category: 'Lower Body',
    duration: '3 sets x 10 reps',
    difficulty: 'Beginner',
    description: 'Hold weight at chest with both hands. Feet shoulder-width, toes out. Squat down keeping elbows inside knees. Chest stays up. Use elbows to push knees out. Drive up explosively.'
  },
  {
    id: 3,
    name: 'Back Squat',
    category: 'Lower Body',
    duration: '4 sets x 8 reps',
    difficulty: 'Intermediate',
    description: 'Bar on upper back, hands outside shoulders. Unrack, step back. Brace core, push hips back. Descend until thighs parallel or below. Keep knees out, chest up. Drive through mid-foot to stand.'
  },
  {
    id: 4,
    name: 'Front Squat',
    category: 'Lower Body',
    duration: '4 sets x 8 reps',
    difficulty: 'Advanced',
    description: 'Bar rests on front shoulders, elbows high. Feet shoulder-width. Keep torso vertical, core braced. Descend keeping elbows up. Drive through whole foot. More quad dominant than back squat.'
  },
  {
    id: 5,
    name: 'Bulgarian Split Squat',
    category: 'Lower Body',
    duration: '3 sets x 10 reps per leg',
    difficulty: 'Intermediate',
    description: 'Rear foot elevated on bench. Front foot far enough forward that knee stays behind toes at bottom. Lower until back knee nearly touches floor. Drive through front heel. Keep torso upright.'
  },
  {
    id: 6,
    name: 'Box Squat',
    category: 'Lower Body',
    duration: '4 sets x 8 reps',
    difficulty: 'Intermediate',
    description: 'Squat back to box, briefly sit controlling weight. Pause, then drive up explosively. Teaches proper hip hinge. Box height should create parallel thigh position. Great for building power.'
  },

  // Deadlift Variations
  {
    id: 7,
    name: 'Conventional Deadlift',
    category: 'Lower Body',
    duration: '4 sets x 6 reps',
    difficulty: 'Intermediate',
    description: 'Feet hip-width, bar over mid-foot. Hinge at hips, grip outside knees. Chest up, lats tight. Push floor away with legs. Lock hips and knees simultaneously. Control descent. Neutral spine throughout.'
  },
  {
    id: 8,
    name: 'Romanian Deadlift (RDL)',
    category: 'Lower Body',
    duration: '3 sets x 10 reps',
    difficulty: 'Intermediate',
    description: 'Start standing with bar. Push hips back, slight knee bend. Lower bar along thighs keeping it close. Feel hamstring stretch. Stop when back rounds or at mid-shin. Drive hips forward to return.'
  },
  {
    id: 9,
    name: 'Sumo Deadlift',
    category: 'Lower Body',
    duration: '4 sets x 6 reps',
    difficulty: 'Intermediate',
    description: 'Wide stance, toes out. Grip inside knees. Chest up, push knees out. Drive through floor spreading it apart. More upright torso than conventional. Engages adductors and glutes heavily.'
  },
  {
    id: 10,
    name: 'Trap Bar Deadlift',
    category: 'Lower Body',
    duration: '4 sets x 8 reps',
    difficulty: 'Beginner',
    description: 'Step inside trap bar, feet hip-width. Grip handles, chest up. Push floor away, stand up tall. More quad dominant, easier on lower back. Great for beginners or high volume work.'
  },
  {
    id: 11,
    name: 'Single Leg Romanian Deadlift',
    category: 'Lower Body',
    duration: '3 sets x 8 reps per leg',
    difficulty: 'Advanced',
    description: 'Balance on one leg, slight knee bend. Hinge at hip, extend other leg back for balance. Lower weight toward floor. Keep hips square. Feel hamstring and glute of standing leg. Return to standing.'
  },

  // Upper Body Push
  {
    id: 12,
    name: 'Push-Up',
    category: 'Upper Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Hands shoulder-width, body straight from head to heels. Lower chest to floor, elbows at 45 degrees. Push through whole hand to return. Keep core tight. Modify on knees if needed.'
  },
  {
    id: 13,
    name: 'Bench Press',
    category: 'Upper Body',
    duration: '4 sets x 8 reps',
    difficulty: 'Intermediate',
    description: 'Lie on bench, feet flat on floor. Grip slightly wider than shoulders. Unrack, lower to chest with control. Elbows at 45-degree angle. Press up explosively. Bar path slightly toward face at top.'
  },
  {
    id: 14,
    name: 'Incline Bench Press',
    category: 'Upper Body',
    duration: '3 sets x 10 reps',
    difficulty: 'Intermediate',
    description: 'Bench at 30-45 degree angle. Same technique as flat bench. Targets upper chest more. Lower to upper chest. Maintain shoulder blade retraction throughout.'
  },
  {
    id: 15,
    name: 'Overhead Press',
    category: 'Upper Body',
    duration: '4 sets x 8 reps',
    difficulty: 'Intermediate',
    description: 'Bar at shoulders, hands just outside shoulders. Brace core. Press bar overhead, move head back slightly. Lock out overhead with bar over mid-foot. Lower with control. Don\'t arch back excessively.'
  },
  {
    id: 16,
    name: 'Dumbbell Shoulder Press',
    category: 'Upper Body',
    duration: '3 sets x 10 reps',
    difficulty: 'Beginner',
    description: 'Dumbbells at shoulder height, palms forward. Press up until arms straight, don\'t bang weights together. Control descent. Can be done seated or standing. Engages stabilizers more than barbell.'
  },
  {
    id: 17,
    name: 'Dips',
    category: 'Upper Body',
    duration: '3 sets x 10 reps',
    difficulty: 'Advanced',
    description: 'Support on parallel bars. Lower until shoulders below elbows. Lean forward for chest emphasis, upright for triceps. Press up to lockout. Add weight when bodyweight becomes easy.'
  },

  // Upper Body Pull
  {
    id: 18,
    name: 'Pull-Up',
    category: 'Upper Body',
    duration: '3 sets x 8 reps',
    difficulty: 'Advanced',
    description: 'Hang from bar, hands shoulder-width, palms away. Pull chest to bar, leading with elbows. Control descent. Engage lats by pulling shoulders down and back. Use band assistance if needed.'
  },
  {
    id: 19,
    name: 'Chin-Up',
    category: 'Upper Body',
    duration: '3 sets x 8 reps',
    difficulty: 'Intermediate',
    description: 'Hang from bar, palms facing you. Pull up until chin over bar. Lower with control. Engages biceps more than pull-ups. Squeeze shoulder blades together at top.'
  },
  {
    id: 20,
    name: 'Barbell Row',
    category: 'Upper Body',
    duration: '4 sets x 8 reps',
    difficulty: 'Intermediate',
    description: 'Hinge at hips, bar hangs at arms length. Pull bar to lower chest/upper stomach. Lead with elbows. Squeeze shoulder blades together. Lower with control. Keep lower back neutral.'
  },
  {
    id: 21,
    name: 'Dumbbell Row',
    category: 'Upper Body',
    duration: '3 sets x 10 reps per arm',
    difficulty: 'Beginner',
    description: 'One hand and knee on bench, other foot on floor. Let dumbbell hang, pull to hip. Elbow stays close to body. Squeeze at top. Lower with control. Keep back flat.'
  },
  {
    id: 22,
    name: 'Lat Pulldown',
    category: 'Upper Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Sit at machine, grip bar wider than shoulders. Pull bar to upper chest, lean back slightly. Lead with elbows. Squeeze shoulder blades together. Control return. Great pull-up progression.'
  },
  {
    id: 23,
    name: 'Cable Row',
    category: 'Upper Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Sit at cable machine, feet braced. Pull handle to torso, sit up tall. Squeeze shoulder blades together. Keep elbows close. Extend arms with control. Constant tension on muscles.'
  },

  // Arm Exercises
  {
    id: 24,
    name: 'Barbell Bicep Curl',
    category: 'Arms',
    duration: '3 sets x 10 reps',
    difficulty: 'Beginner',
    description: 'Stand holding bar, hands shoulder-width, palms up. Keep elbows tucked at sides. Curl bar up, squeeze biceps at top. Lower with control. Don\'t swing or use momentum. Keep wrists straight.'
  },
  {
    id: 25,
    name: 'Dumbbell Bicep Curl',
    category: 'Arms',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Stand or sit with dumbbells at sides, palms forward. Curl weights up, keep elbows still. Squeeze at top. Lower slowly. Can alternate arms or do together. Rotate palms up as you curl.'
  },
  {
    id: 26,
    name: 'Hammer Curl',
    category: 'Arms',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Hold dumbbells with palms facing each other (hammer grip). Curl up keeping this grip throughout. Targets brachialis and brachioradialis. Keep elbows at sides. Control the descent.'
  },
  {
    id: 27,
    name: 'Tricep Pushdown',
    category: 'Arms',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Stand at cable machine, grip bar at chest height. Keep elbows tucked at sides. Push down until arms straight. Control return. Only forearms move. Squeeze triceps at bottom.'
  },
  {
    id: 28,
    name: 'Overhead Tricep Extension',
    category: 'Arms',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Hold weight overhead with both hands. Keep elbows close to head. Lower behind head, feel tricep stretch. Extend arms back up. Keep upper arms still. Can use dumbbell or cable.'
  },
  {
    id: 29,
    name: 'Close-Grip Bench Press',
    category: 'Arms',
    duration: '3 sets x 10 reps',
    difficulty: 'Intermediate',
    description: 'Lie on bench, grip bar hands shoulder-width or narrower. Lower to chest keeping elbows close to sides. Press up. Excellent tricep builder. Don\'t let elbows flare out.'
  },

  // Leg Isolation
  {
    id: 30,
    name: 'Leg Press',
    category: 'Lower Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Feet shoulder-width on platform. Lower until knees at 90 degrees. Press through whole foot to extend. Don\'t lock knees hard at top. Keep lower back pressed to pad throughout.'
  },
  {
    id: 31,
    name: 'Leg Curl',
    category: 'Lower Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Lie face down on machine. Curl heels toward buttocks. Squeeze hamstrings at top. Lower with control. Keep hips pressed to pad. Don\'t arch lower back.'
  },
  {
    id: 32,
    name: 'Leg Extension',
    category: 'Lower Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Sit on machine, shins behind pad. Extend legs until straight. Squeeze quads at top. Lower with control. Adjust seat so knees align with machine pivot. Great quad isolation.'
  },
  {
    id: 33,
    name: 'Walking Lunges',
    category: 'Lower Body',
    duration: '3 sets x 10 reps per leg',
    difficulty: 'Intermediate',
    description: 'Step forward into lunge, back knee nearly touches floor. Drive through front heel to step forward with other leg. Keep torso upright. Can hold dumbbells for resistance. Great for balance and coordination.'
  },
  {
    id: 34,
    name: 'Calf Raise',
    category: 'Lower Body',
    duration: '4 sets x 15 reps',
    difficulty: 'Beginner',
    description: 'Stand on edge of step, heels hanging off. Rise up on toes as high as possible. Hold briefly at top. Lower until calves stretched. Can use machine or hold dumbbells. Keep legs mostly straight.'
  },

  // Core
  {
    id: 35,
    name: 'Plank',
    category: 'Core',
    duration: '3 sets x 45-60 seconds',
    difficulty: 'Beginner',
    description: 'Forearms on ground, body straight from head to heels. Don\'t let hips sag or pike up. Engage abs and glutes. Breathe steadily. Keep neck neutral looking at floor between hands.'
  },
  {
    id: 36,
    name: 'Ab Wheel Rollout',
    category: 'Core',
    duration: '3 sets x 10 reps',
    difficulty: 'Advanced',
    description: 'Kneel holding ab wheel. Roll forward extending body, keep core tight. Go as far as possible without arching back. Pull back to start. One of most effective core exercises. Progress to standing version.'
  },
  {
    id: 37,
    name: 'Hanging Leg Raise',
    category: 'Core',
    duration: '3 sets x 12 reps',
    difficulty: 'Advanced',
    description: 'Hang from bar. Raise legs until parallel to floor or higher. Lower with control. Don\'t swing. Keep slight knee bend. Focus on using abs, not hip flexors. Advanced: raise to touch bar.'
  },
  {
    id: 38,
    name: 'Cable Crunch',
    category: 'Core',
    duration: '3 sets x 15 reps',
    difficulty: 'Intermediate',
    description: 'Kneel at cable machine, hold rope behind head. Crunch down bringing elbows toward knees. Squeeze abs at bottom. Control return. Hips stay still. Great for weighted ab work.'
  },
  {
    id: 39,
    name: 'Russian Twist',
    category: 'Core',
    duration: '3 sets x 20 reps (10 each side)',
    difficulty: 'Intermediate',
    description: 'Sit with knees bent, lean back slightly. Hold weight at chest. Rotate torso side to side, touching weight to floor each side. Keep core engaged. Can lift feet for more difficulty.'
  },
  {
    id: 40,
    name: 'Dead Bug',
    category: 'Core',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Lie on back, arms up toward ceiling, knees at 90 degrees. Lower opposite arm and leg, keeping lower back pressed to floor. Return to start. Breathe out as you extend. Great for stability.'
  }
];
