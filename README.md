# Team Calendar

A multi-user team calendar built with **Next.js 14 + React**, **FullCalendar**, and a **MySQL** database (via Prisma). Users sign in (Google or email/password), create groups, invite teammates, and share a calendar where every event records **who created and last edited it**.

- Accounts: email/password **and** Google sign-in
- Groups you can invite people into (by email, with a shareable invite link)
- Shared events scoped to a group
- Attribution + edit history: see who created and edited each event
- Month / Week / Day / List views, drag to reschedule, resize to change duration
- Roles: OWNER / ADMIN / MEMBER (admins+owners can invite; creators/admins/owners can delete)

> Google Calendar sync is intentionally **not** included yet — the app's own database is the source of truth. It can be added later as an optional per-user sync.

---

## Start it — 4 steps (no backend knowledge needed)

You don't need to understand the backend. Just run four things in order. The
`.env` file (with database settings and a secret) has **already been created for
you**, so you can skip all of that.

> **About that `error=Configuration` you saw:** it's not a bug. It just means
> the app hadn't been set up yet — no database, no secret. The steps below fix
> it. Once the database tables exist and the `.env` is in place (it now is), the
> error goes away.

**Step 1 — Start MySQL.**
Open the **XAMPP Control Panel** and click **Start** next to **MySQL**.
(That's your database. The app talks to it. You don't have to create anything in
it — the next step builds the tables automatically.)

**Step 2 — Open a terminal in this folder.**
In File Explorer, go to `C:\xampp\htdocs\github\gcal-app`, type `cmd` in the
address bar, and press Enter. A black terminal window opens in the right place.

**Step 3 — Run these three commands, one at a time** (wait for each to finish):

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

- `npm install` downloads everything the app needs (this is what was missing
  when you got `'next' is not recognized`). Takes a few minutes the first time.
- `npx prisma migrate dev` creates the `gcal_app` database **and all its tables
  automatically** — you do not need to make anything in phpMyAdmin.
- `npm run dev` starts the app.

**Step 4 — Open the app.**
Go to **http://localhost:3000**. You'll land on a sign-in page. Click
**Create an account**, register with any email + password, and you're in.

Then: create a group in the sidebar, invite a teammate by email (it gives you a
link to send them), and click any time slot to add an event. Every event shows
who created and last edited it.

> To stop the app, click the terminal and press `Ctrl + C`. To start it again
> later, just run `npm run dev` (Steps 1 and 4 only — you don't repeat install
> or migrate unless the code or database changes).

> Want to see the data? Run `npm run db:studio` for a visual table browser, or
> open phpMyAdmin at http://localhost/phpmyadmin.

## 5. (Optional) Enable Google sign-in

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project.
2. **APIs & Services → OAuth consent screen** → External → add yourself under **Test users**.
3. **Credentials → Create OAuth client ID → Web application**:
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Put the client ID/secret in `.env`, restart `npm run dev`. A "Continue with Google" button appears automatically.

---

## Development workflow (commit standards)

This repo enforces clean commits automatically:

- **Husky** runs git hooks.
- **lint-staged** runs ESLint + Prettier on staged files before each commit.
- **commitlint** requires [Conventional Commits](https://www.conventionalcommits.org/) on the commit message.

Husky installs itself via the `prepare` script during `npm install`. If hooks don't fire, run `npx husky` once.

Valid commit messages look like:

```
feat: add event edit history
fix(events): correct all-day end date
chore: update dependencies
docs: expand setup guide
```

A message like `updated stuff` will be **rejected**.

---

## Publish to GitHub

From the project folder (`C:\xampp\htdocs\github\gcal-app`):

```bash
git init
git add .
git commit -m "chore: initial commit"
```

Then create the GitHub repo and push. Easiest with the GitHub CLI (`gh`):

```bash
gh auth login            # one-time
gh repo create gcal-app --private --source=. --remote=origin --push
```

Or manually: create an empty repo on github.com, then:

```bash
git remote add origin https://github.com/<your-username>/gcal-app.git
git branch -M main
git push -u origin main
```

> `.gitignore` already excludes `node_modules`, `.next`, and `.env` (your secrets are not committed).

---

## Deploy to Vercel

1. Push to GitHub (above).
2. Go to https://vercel.com → **Add New → Project** → import the `gcal-app` repo.
3. Add Environment Variables (same keys as `.env`): `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (set to your Vercel URL, e.g. `https://gcal-app.vercel.app`), and the Google keys if used.
4. Deploy. The build runs `prisma generate && next build`.
5. If you enabled Google, add the production redirect URI in Google Cloud: `https://<your-vercel-domain>/api/auth/callback/google`.

### ⚠️ Important: the database and Vercel

**Vercel runs in the cloud and cannot reach a MySQL database on your local machine (`localhost`).** Your local XAMPP MySQL is perfect for development, but for a deployed app you need a database Vercel can connect to. Options:

- **Self-host the whole app** on a company server (e.g. with Docker) next to its own MySQL — then "local" MySQL is fine because the app lives there too. Best if the data must stay on company infrastructure.
- **Use a network-reachable MySQL** for production: a managed MySQL (PlanetScale, Railway, AWS RDS, etc.) or your company's database server exposed securely. Then just set `DATABASE_URL` in Vercel to that connection string — no code changes needed.

Because the app uses Prisma, switching databases is only a connection-string change. You can keep developing against XAMPP locally and point production at a reachable database.

> Tip: For local schema changes use `npx prisma migrate dev`; to apply existing migrations in production use `npx prisma migrate deploy`.

---

## Project structure

```
prisma/schema.prisma        Data model: users, groups, memberships, invitations, events, activity log
middleware.ts               Protects all routes; redirects to /login when signed out
lib/
  auth.ts                   NextAuth (Google + email/password credentials) + Prisma adapter
  prisma.ts                 Prisma client singleton
  permissions.ts            getCurrentUserId / getMembership helpers
app/
  login, register           Auth pages
  invite/[token]            Accept-invitation landing page
  api/
    auth/[...nextauth]      NextAuth handler
    register                Email/password sign-up
    groups, groups/[id]     Create/list groups, group detail + members
    groups/[id]/invitations Invite + list invitations
    invitations             Pending invites for me
    invitations/accept      Accept an invite
    events, events/[id]     Group-scoped event CRUD with attribution + activity log
components/
  CalendarView, EventModal, Sidebar, AuthForm, Providers
```

## Adding Google Calendar sync later

The data model and API are calendar-agnostic. To sync, add the Google Calendar scope back to the Google provider, store per-user tokens, and on event create/update/delete also call the Google Calendar API — mapping each `Event` to a Google event id (add a `googleEventId` column).
