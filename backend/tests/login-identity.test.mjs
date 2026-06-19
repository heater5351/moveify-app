import { describe, it, expect } from 'vitest';

// Shared-email login identity: pure helpers (used by the invite/login/reset
// flows) plus the username-collision suffixing that backs auto-generated login
// names for a second patient sharing a spouse's email.
const { slugifyName, toLoginEmail, LOGIN_USERNAME_DOMAIN } = await import('../lib/login-identity.js');

describe('slugifyName', () => {
  it('lowercases and hyphenates a normal name', () => {
    expect(slugifyName('John Smith')).toBe('john-smith');
  });

  it('collapses punctuation and extra spaces into single hyphens', () => {
    expect(slugifyName("  Mary-Anne  O'Brien ")).toBe('mary-anne-o-brien');
  });

  it('strips leading/trailing separators', () => {
    expect(slugifyName('!!John!!')).toBe('john');
  });

  it('falls back to "patient" when nothing usable remains', () => {
    expect(slugifyName('***')).toBe('patient');
    expect(slugifyName('')).toBe('patient');
    expect(slugifyName(null)).toBe('patient');
  });
});

describe('toLoginEmail', () => {
  it('appends the synthetic login domain', () => {
    expect(toLoginEmail('john-smith')).toBe(`john-smith@${LOGIN_USERNAME_DOMAIN}`);
  });

  it('normalises case and whitespace', () => {
    expect(toLoginEmail('  John-Smith  ')).toBe(`john-smith@${LOGIN_USERNAME_DOMAIN}`);
  });
});

// Mirror of routes/invitations.js generateLoginUsername against a fake client,
// so the suffix-on-collision behaviour is locked without a real DB.
async function generateLoginUsername(client, name) {
  const base = slugifyName(name);
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const taken = await client.query(
      'SELECT 1 FROM users WHERE LOWER(login_username) = $1 LIMIT 1',
      [candidate]
    );
    if (taken.rows.length === 0) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

const fakeClient = (taken) => ({
  query: async (_sql, [candidate]) => ({ rows: taken.has(candidate) ? [{ '?column?': 1 }] : [] }),
});

describe('generateLoginUsername (collision suffixing)', () => {
  it('uses the bare slug when free', async () => {
    expect(await generateLoginUsername(fakeClient(new Set()), 'John Smith')).toBe('john-smith');
  });

  it('appends -2 when the base is taken', async () => {
    expect(await generateLoginUsername(fakeClient(new Set(['john-smith'])), 'John Smith')).toBe('john-smith-2');
  });

  it('keeps incrementing past consecutive collisions', async () => {
    const taken = new Set(['john-smith', 'john-smith-2', 'john-smith-3']);
    expect(await generateLoginUsername(fakeClient(taken), 'John Smith')).toBe('john-smith-4');
  });
});
