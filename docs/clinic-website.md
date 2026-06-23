# Clinic Website

The marketing site at **https://www.moveifyhealth.com** lives on its own orphan-style branch `clinic-website` (not on `dev` or `main`). It is a static Tailwind site deployed by Vercel, separate from the patient app.

**To work on it:** use the existing git worktree at `../moveify-clinic-website` (sibling to this repo). Editing the `clinic-website/` directory on `dev` will not affect the live site — that directory on `dev` is empty/stale by design.

- Homepage HTML: `clinic-website/tailwind css template/index.html`
- Privacy policy: `clinic-website/tailwind css template/privacy-policy.html`
- Copy reference doc: `clinic-website/COPY.md` (canonical source for homepage copy rewrites)
- Vercel config: `clinic-website/vercel.json` (routes `/(.*)` → `tailwind css template/$1`)

**Deploy:** push to `origin/clinic-website` → Vercel auto-deploys. No backend redeploy needed.

If the worktree is missing, recreate with: `git worktree add ../moveify-clinic-website clinic-website`
