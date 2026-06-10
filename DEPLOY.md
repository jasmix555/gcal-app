# Deploy guide — GitHub + Neon + Vercel

This gets your app live at a public URL (and optionally a custom subdomain). About 15 minutes.

---

## 1. Create the database (Neon — free)

1. Sign up at [neon.tech](https://neon.tech) and create a project (pick a region near you).
2. On the project dashboard, open **Connection string** and choose the **Prisma** / "Connection pooling" option.
3. Copy the string. It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
   Keep it handy — you'll use it in two places (locally and on Vercel).

## 2. Create the tables in that database

From the project folder, point `.env`'s `DATABASE_URL` at the Neon string above, then:

```bash
npm install
npx prisma db push      # creates all tables in Neon
npx prisma db seed      # optional: demo account + sample events
```

> `db push` reads `DATABASE_URL`, so whatever it points to is what gets the tables. Run this again later whenever you change `schema.prisma`.

## 3. Push the code to GitHub

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) (via husky/commitlint), so commit messages must look like `feat: ...`, `fix: ...`, `chore: ...`.

```bash
git init
git add .
git commit -m "chore: initial commit"
```

Create the repo and push (GitHub CLI is easiest):

```bash
gh auth login
gh repo create gcal-app --public --source=. --remote=origin --push
```

Or manually: create an empty repo at github.com/jasmix555/gcal-app, then:

```bash
git remote add origin https://github.com/jasmix555/gcal-app.git
git branch -M main
git push -u origin main
```

> `.gitignore` already excludes `.env` and `node_modules`, so your secrets and the connection string are **not** committed.

## 4. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import `gcal-app`.
2. Before deploying, open **Environment Variables** and add:

   | Name                                        | Value                                               |
   | ------------------------------------------- | --------------------------------------------------- |
   | `DATABASE_URL`                              | your Neon connection string                         |
   | `NEXTAUTH_SECRET`                           | a long random string (`openssl rand -base64 32`)    |
   | `NEXTAUTH_URL`                              | your Vercel URL, e.g. `https://gcal-app.vercel.app` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | only if using Google sign-in                        |

3. Click **Deploy**. The build runs `prisma generate && next build`.
4. After the first deploy you'll know your real URL. If you guessed `NEXTAUTH_URL` wrong, fix it in Settings → Environment Variables and **Redeploy** (NextAuth needs it to match the live URL exactly).

Open the URL → click **Try the demo**. Done — that's your shareable link.

## 5. (Optional) Use a company subdomain

If IT can add a DNS record, you can serve the app at `calendar.yourcompany.com`:

1. In Vercel: Project → **Settings → Domains** → add `calendar.yourcompany.com`. Vercel shows you a **CNAME** target (e.g. `cname.vercel-dns.com`).
2. Give IT that one CNAME record to add for the subdomain. (This is the "subdomain is possible" thing they offered — it just points at Vercel.)
3. Update `NEXTAUTH_URL` to `https://calendar.yourcompany.com` and redeploy.

## 6. (Optional) Enable Google sign-in in production

In Google Cloud → Credentials → your OAuth client, add the production redirect URI:

```
https://<your-domain>/api/auth/callback/google
```

Then set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel and redeploy.

---

### Updating the app later

Just push to GitHub — Vercel redeploys automatically:

```bash
git add .
git commit -m "feat: whatever you changed"
git push
```

If you changed `prisma/schema.prisma`, also run `npx prisma db push` (pointed at the Neon URL) to update the tables.
