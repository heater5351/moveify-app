---
description: Safe PostgreSQL migration patterns for Moveify's production database
---

# Database Migration Skill

Moveify uses raw SQL migrations in `backend/database/init.js`. All schema changes go through the `initDatabase()` function using `IF NOT EXISTS` / `IF NOT EXISTS` guards.

**This is a PRODUCTION database with real patient health data in Cloud SQL (australia-southeast1). Be extremely careful.**

## Safety Rules

1. **Never DROP columns or tables** without explicit user confirmation
2. **Never ALTER existing columns** (type changes, NOT NULL additions) — add new columns instead
3. **New columns MUST be nullable or have a DEFAULT** — never add NOT NULL without a default
4. **Always use IF NOT EXISTS / IF NOT EXISTS** guards so migrations are idempotent
5. **Never mix schema changes with data backfills** in the same migration block
6. **Test locally first** — run `cd backend && npm run dev` to verify migration runs clean

## Adding a Column

```sql
-- GOOD: Nullable column, idempotent
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- GOOD: Column with default
ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- BAD: NOT NULL without default (rewrites entire table, locks it)
ALTER TABLE users ADD COLUMN status TEXT NOT NULL;
```

## Adding an Index

```sql
-- Use CREATE INDEX IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_completions_date ON exercise_completions (completion_date);

-- For large tables, use CONCURRENTLY (cannot be inside a transaction):
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_completions_patient ON exercise_completions (patient_id);
```

## Renaming a Column (Expand-Contract)

Never rename directly. Use 3-step process across deploys:

1. **Add new column** (nullable): `ALTER TABLE x ADD COLUMN new_name TEXT;`
2. **Deploy code** that writes to BOTH old and new columns, reads from new (falling back to old)
3. **Backfill**: `UPDATE x SET new_name = old_name WHERE new_name IS NULL;`
4. **Deploy code** that only uses new column
5. **Drop old column** in a later migration (after confirming nothing reads it)

## Large Data Backfills

For tables with many rows, batch the update:

```sql
-- Batch update to avoid long locks
DO $$
DECLARE
  batch_size INT := 5000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE exercise_completions
    SET new_column = computed_value
    WHERE id IN (
      SELECT id FROM exercise_completions
      WHERE new_column IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    COMMIT;
  END LOOP;
END $$;
```

## Where to Put Migrations

All migrations go in `backend/database/init.js` inside the `initDatabase()` function:

```javascript
// In initDatabase(), after table creation:
await pool.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS new_field TEXT;
`);
```

## Pre-Migration Checklist

- [ ] Column is nullable or has a DEFAULT
- [ ] Uses IF NOT EXISTS / IF NOT EXISTS guards
- [ ] Tested locally with `npm run dev`
- [ ] No destructive changes (DROP, ALTER type, remove NOT NULL)
- [ ] Backfill is separate from schema change
- [ ] User has confirmed any destructive operations
- [ ] Deployment planned outside AEST business hours (backend restart = ~30s downtime)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Do This Instead |
|---|---|---|
| `ALTER COLUMN SET NOT NULL` on existing column | Locks table, scans all rows | Add CHECK constraint or validate in code |
| `DROP COLUMN` without removing code first | App crashes on missing column | Remove code references first, drop column next deploy |
| Manual SQL on production | No audit trail, can't reproduce | Always add to init.js migrations |
| Schema + data change together | Long transaction, hard to debug | Separate migration steps |
| `RENAME COLUMN` | Breaks running app instances | Use expand-contract pattern |
