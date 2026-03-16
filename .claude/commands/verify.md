---
description: Pre-deploy verification loop — runs build, typecheck, lint, tests, and security scan
---

# Verification Loop

Run all quality gates before deploying. STOP and fix any failures before continuing.

## Phase 1: Frontend Build + Typecheck
```bash
cd frontend && npm run build 2>&1 | tail -20
```
If build fails, STOP and fix before continuing.

## Phase 2: Frontend Lint
```bash
cd frontend && npm run lint 2>&1 | head -30
```

## Phase 3: Backend Tests
```bash
cd backend && npm test 2>&1 | tail -30
```

## Phase 4: Frontend Tests
```bash
cd frontend && npm test 2>&1 | tail -30
```

## Phase 5: Security Scan

Check for leaked secrets, console.log, and health data exposure:
```bash
# Hardcoded secrets
grep -rn "sk-\|api_key\|password.*=" --include="*.ts" --include="*.js" --include="*.tsx" frontend/src/ backend/ 2>/dev/null | grep -v node_modules | grep -v ".test." | head -10

# Console.log left in code (backend only — frontend console.log is ok for dev)
grep -rn "console.log" --include="*.js" backend/routes/ backend/middleware/ 2>/dev/null | head -10

# Patient health data in logs (pain, condition, check-in)
grep -rn "console\.\(log\|info\|warn\).*\(pain\|condition\|check.in\|mood\|sleep\)" --include="*.js" backend/ 2>/dev/null | head -10
```

## Phase 6: Diff Review
```bash
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for unintended changes and edge cases.

## Output

Produce a verification report:

```
VERIFICATION REPORT
==================
Frontend Build:  [PASS/FAIL]
Frontend Lint:   [PASS/FAIL] (X warnings)
Backend Tests:   [PASS/FAIL] (X/Y passed)
Frontend Tests:  [PASS/FAIL] (X/Y passed)
Security Scan:   [PASS/FAIL] (X issues)
Diff:            [X files changed]

Overall: [READY/NOT READY] for deploy

Issues to Fix:
1. ...
```
