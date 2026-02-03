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
  },

  // Additional Upper Body
  {
    id: 41,
    name: 'Face Pull',
    category: 'Upper Body',
    duration: '3 sets x 15 reps',
    difficulty: 'Beginner',
    description: 'Stand at cable machine with rope attachment at face height. Pull rope toward face, separating handles. Lead with elbows high. Squeeze shoulder blades together. Excellent for rear delts and posture.'
  },
  {
    id: 42,
    name: 'Lateral Raise',
    category: 'Upper Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Stand with dumbbells at sides. Raise arms out to sides until parallel to floor. Keep slight elbow bend. Lower with control. Targets side delts for shoulder width. Don\'t swing weights.'
  },
  {
    id: 43,
    name: 'Front Raise',
    category: 'Upper Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Stand with dumbbells in front of thighs. Raise weights forward to shoulder height. Keep arms straight, core braced. Lower slowly. Targets front delts. Can alternate arms or do together.'
  },
  {
    id: 44,
    name: 'Shrugs',
    category: 'Upper Body',
    duration: '3 sets x 15 reps',
    difficulty: 'Beginner',
    description: 'Hold heavy dumbbells or barbell at sides. Elevate shoulders straight up toward ears. Hold briefly at top. Lower slowly. Builds trapezius muscles. Keep arms straight throughout.'
  },
  {
    id: 45,
    name: 'Arnold Press',
    category: 'Upper Body',
    duration: '3 sets x 10 reps',
    difficulty: 'Intermediate',
    description: 'Start with dumbbells at shoulders, palms facing you. Press up while rotating palms forward. End with palms facing away at top. Reverse on descent. Combines pressing with rotation for complete shoulder work.'
  },
  {
    id: 46,
    name: 'Upright Row',
    category: 'Upper Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Intermediate',
    description: 'Hold bar with narrow grip at thighs. Pull bar straight up along body to chest height. Lead with elbows high. Lower with control. Targets shoulders and upper traps. Keep bar close to body.'
  },
  {
    id: 47,
    name: 'Reverse Fly',
    category: 'Upper Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Bend forward at hips, dumbbells hanging. Raise arms out to sides, squeezing shoulder blades. Keep slight elbow bend. Lower slowly. Excellent for rear delts and upper back. Can do seated or standing.'
  },
  {
    id: 48,
    name: 'Skull Crusher',
    category: 'Arms',
    duration: '3 sets x 12 reps',
    difficulty: 'Intermediate',
    description: 'Lie on bench, hold bar or dumbbells overhead. Lower weight toward forehead by bending elbows. Keep upper arms still. Extend back to start. Excellent tricep isolation. Control the weight carefully.'
  },
  {
    id: 49,
    name: 'Concentration Curl',
    category: 'Arms',
    duration: '3 sets x 12 reps per arm',
    difficulty: 'Beginner',
    description: 'Sit on bench, elbow braced against inner thigh. Curl dumbbell up toward shoulder. Squeeze bicep at top. Lower slowly. Great for peak contraction and bicep isolation.'
  },
  {
    id: 50,
    name: 'Preacher Curl',
    category: 'Arms',
    duration: '3 sets x 12 reps',
    difficulty: 'Intermediate',
    description: 'Arms over preacher bench pad. Curl bar or dumbbells toward shoulders. Keep upper arms pressed to pad. Lower with control. Eliminates momentum, isolates biceps effectively.'
  },
  {
    id: 51,
    name: 'Zottman Curl',
    category: 'Arms',
    duration: '3 sets x 10 reps',
    difficulty: 'Intermediate',
    description: 'Curl dumbbells up with palms supinated. At top, rotate palms down. Lower with palms pronated. Rotate back at bottom. Works biceps, forearms, and brachialis in one movement.'
  },
  {
    id: 52,
    name: 'Diamond Push-Up',
    category: 'Upper Body',
    duration: '3 sets x 10 reps',
    difficulty: 'Advanced',
    description: 'Push-up position with hands close together forming diamond shape with thumbs and fingers. Lower chest to hands. Push up explosively. Intense tricep and inner chest activation.'
  },

  // Additional Lower Body
  {
    id: 53,
    name: 'Hack Squat',
    category: 'Lower Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Intermediate',
    description: 'Stand on hack squat machine, shoulders under pads. Lower until thighs parallel. Drive through heels to stand. Keeps torso more upright than back squat. Great quad builder.'
  },
  {
    id: 54,
    name: 'Good Morning',
    category: 'Lower Body',
    duration: '3 sets x 10 reps',
    difficulty: 'Intermediate',
    description: 'Bar on upper back. Hinge at hips, pushing them back. Lower torso until parallel to floor. Keep back flat, slight knee bend. Drive hips forward to stand. Excellent for hamstrings and lower back.'
  },
  {
    id: 55,
    name: 'Hip Thrust',
    category: 'Lower Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Intermediate',
    description: 'Upper back on bench, barbell over hips. Drive hips up until body forms straight line. Squeeze glutes at top. Lower with control. Best exercise for glute development. Use pad for comfort.'
  },
  {
    id: 56,
    name: 'Nordic Hamstring Curl',
    category: 'Lower Body',
    duration: '3 sets x 6 reps',
    difficulty: 'Advanced',
    description: 'Kneel with ankles secured. Lower body forward with control, keeping hips extended. Use hands to catch yourself. Push back to start. Extremely challenging hamstring exercise. Start with assisted version.'
  },
  {
    id: 57,
    name: 'Sissy Squat',
    category: 'Lower Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Advanced',
    description: 'Stand holding support. Lean back while bending knees forward. Keep hips extended, body in line. Lower as far as comfortable. Return to start. Advanced quad exercise. Very knee-intensive.'
  },
  {
    id: 58,
    name: 'Glute Ham Raise',
    category: 'Lower Body',
    duration: '3 sets x 8 reps',
    difficulty: 'Advanced',
    description: 'On GHR machine, feet secured. Lower torso toward floor with control. Use hamstrings and glutes to pull back up. One of most effective posterior chain exercises. Very challenging.'
  },
  {
    id: 59,
    name: 'Reverse Lunge',
    category: 'Lower Body',
    duration: '3 sets x 10 reps per leg',
    difficulty: 'Beginner',
    description: 'Step backward into lunge position. Back knee nearly touches floor. Drive through front heel to return. Easier on knees than forward lunges. Great for balance and leg strength.'
  },
  {
    id: 60,
    name: 'Step Down',
    category: 'Lower Body',
    duration: '3 sets x 10 reps per leg',
    difficulty: 'Intermediate',
    description: 'Stand on box or step. Lower opposite foot toward floor with control. Tap floor lightly. Push through standing leg to return. Great for eccentric quad strength. Keep knee aligned over toes.'
  },
  {
    id: 61,
    name: 'Seated Calf Raise',
    category: 'Lower Body',
    duration: '4 sets x 15 reps',
    difficulty: 'Beginner',
    description: 'Sit on machine, balls of feet on platform, weight on knees. Lower heels as far as possible. Raise up onto toes. Targets soleus muscle more than standing version. Use full range of motion.'
  },
  {
    id: 62,
    name: 'Landmine Squat',
    category: 'Lower Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Hold end of barbell at chest, other end anchored. Squat down keeping torso upright. Drive through heels to stand. Easier to maintain form than traditional squat. Great for beginners.'
  },

  // Additional Core
  {
    id: 63,
    name: 'Bicycle Crunch',
    category: 'Core',
    duration: '3 sets x 20 reps',
    difficulty: 'Beginner',
    description: 'Lie on back, hands behind head. Bring opposite elbow to opposite knee while extending other leg. Alternate sides in cycling motion. Engages obliques and rectus abdominis effectively.'
  },
  {
    id: 64,
    name: 'Mountain Climber',
    category: 'Core',
    duration: '3 sets x 30 seconds',
    difficulty: 'Intermediate',
    description: 'Start in push-up position. Drive knees toward chest alternating quickly. Keep hips level, core tight. Combines core stability with cardio. Great for conditioning and abs.'
  },
  {
    id: 65,
    name: 'L-Sit',
    category: 'Core',
    duration: '3 sets x 20-30 seconds',
    difficulty: 'Advanced',
    description: 'Support on parallel bars or floor. Lift legs straight out in front parallel to floor. Hold position. Intense core and hip flexor exercise. Start with knees bent if needed.'
  },
  {
    id: 66,
    name: 'Dragon Flag',
    category: 'Core',
    duration: '3 sets x 6 reps',
    difficulty: 'Advanced',
    description: 'Lie on bench, grip behind head. Lift entire body up, keeping it straight. Lower slowly with control. Stop before lower back touches. Extremely advanced core exercise. Build up gradually.'
  },
  {
    id: 67,
    name: 'Side Bend',
    category: 'Core',
    duration: '3 sets x 15 reps per side',
    difficulty: 'Beginner',
    description: 'Stand holding dumbbell in one hand. Bend sideways toward weight side. Return to start. Targets obliques. Don\'t lean forward or back. Can do both sides or alternate.'
  },
  {
    id: 68,
    name: 'Turkish Get-Up',
    category: 'Core',
    duration: '3 sets x 5 reps per side',
    difficulty: 'Advanced',
    description: 'Lie on back holding weight overhead. Stand up while keeping arm vertical. Reverse to return. Complex full-body movement. Requires stability, mobility, and core strength. Learn proper sequence.'
  },
  {
    id: 69,
    name: 'Woodchopper',
    category: 'Core',
    duration: '3 sets x 12 reps per side',
    difficulty: 'Intermediate',
    description: 'Stand at cable machine. Pull handle diagonally across body from high to low or low to high. Rotate torso. Targets obliques and teaches rotational power. Keep arms relatively straight.'
  },
  {
    id: 70,
    name: 'Bird Dog Crunch',
    category: 'Core',
    duration: '3 sets x 12 reps per side',
    difficulty: 'Intermediate',
    description: 'Start in bird dog position with opposite arm and leg extended. Crunch elbow to knee under body. Extend back out. Combines stability with dynamic core work. Keep back flat throughout.'
  },

  // Additional Specialized Exercises
  {
    id: 71,
    name: 'Seated Machine Row',
    category: 'Upper Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Beginner',
    description: 'Sit at rowing machine, chest against pad. Grip handles with neutral or pronated grip. Pull handles toward torso, driving elbows back. Squeeze shoulder blades together at end. Control return. Machine provides stable support for focused back work.'
  },
  {
    id: 72,
    name: 'Lat Pullover',
    category: 'Upper Body',
    duration: '3 sets x 12 reps',
    difficulty: 'Intermediate',
    description: 'Lie on bench, dumbbell held overhead with both hands. Keep arms nearly straight with slight elbow bend. Lower weight behind head until stretch in lats. Pull back over chest. Excellent for lat width and serratus. Breathe deeply throughout.'
  },
  {
    id: 73,
    name: 'Rear Delt Fly',
    category: 'Upper Body',
    duration: '3 sets x 15 reps',
    difficulty: 'Beginner',
    description: 'Sit on bench bent forward or use pec deck machine facing backward. Start with arms forward, slight bend in elbows. Pull weights out to sides, squeezing shoulder blades. Focus on rear delts, not traps. Control the return. Essential for shoulder balance.'
  },
  {
    id: 74,
    name: 'Face Pull with 90° External Rotation',
    category: 'Upper Body',
    duration: '3 sets x 15 reps',
    difficulty: 'Intermediate',
    description: 'Stand at cable with rope at upper chest height. Pull rope toward face, then rotate hands up and back at 90 degrees. Elbows stay high throughout. Hold rotation briefly. Targets rear delts, rotator cuff, and upper back. Critical for shoulder health.'
  },
  {
    id: 75,
    name: 'Seated Incline Bicep Curl',
    category: 'Arms',
    duration: '3 sets x 12 reps',
    difficulty: 'Intermediate',
    description: 'Sit on incline bench at 45 degrees, dumbbells hanging. Arms start behind body creating stretch on biceps. Curl weights up keeping upper arms still. Squeeze at top. Lower with control. Emphasizes long head of biceps. Don\'t swing.'
  },
  {
    id: 76,
    name: 'Overhead Tricep Extension Pronated',
    category: 'Arms',
    duration: '3 sets x 12 reps',
    difficulty: 'Intermediate',
    description: 'Stand or sit holding dumbbell overhead with palms facing down (pronated grip). Keep elbows close to head pointing forward. Lower weight behind head by bending elbows. Extend back to start. Pronated grip increases difficulty and targets long head. Keep upper arms stationary.'
  }
];
