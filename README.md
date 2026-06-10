# Team Calendar

A multi-user team calendar web app — sign in, create a group, invite teammates, and share one calendar where **every event records who created and last edited it**. Built with Next.js, Prisma, and PostgreSQL.

**Live demo:** _add your Vercel URL here_ → try it instantly with the **"Try the demo (no signup)"** button, or log in with `demo@demo.com` / `demodemo`.

> Built by [Jason Ng (@jasmix555)](https://github.com/jasmix555).

---

## Screenshots

> Drop your images in a `docs/` folder and they'll show here.

| Week view                   | Event with attribution         | Sign in                  |
| --------------------------- | ------------------------------ | ------------------------ |
| ![Week view](docs/week.png) | ![Event modal](docs/event.png) | ![Login](docs/login.png) |

---

## Features

- **Two ways to sign in** — email/password and Google OAuth.
- **Groups & invitations** — create a group and invite people by email; each invite is a shareable link that drops them straight into the group.
- **Shared, attributed events** — events are scoped to a group, and each one shows who created it, who last edited it, and a full activity history.
- **Roles & permissions** — OWNER / ADMIN / MEMBER. Admins and owners can invite; creators, admins, and owners can delete.
- **Full calendar UX** — month / week / day / list views, click-to-create, drag to reschedule, resize to change duration.
- **Color-coded by person** — events are colored per creator, with matching dots next to members.
- **Polished UI** — Tailwind CSS, rounded soft styling, and subtle animations (with reduced-motion support).

## Tech stack

| Layer     | Tech                                             |
| --------- | ------------------------------------------------ |
| Framework | Next.js 14 (App Router), React 18, TypeScript    |
| Styling   | Tailwind CSS                                     |
| Calendar  | FullCalendar                                     |
| Auth      | NextAuth (Google + Credentials), bcrypt          |
| Database  | PostgreSQL via Prisma ORM                        |
| Tooling   | ESLint, Prettier, Husky, lint-staged, commitlint |
| Hosting   | Vercel + Neon (serverless Postgres)              |

## Architecture

The browser talks only to this app's own API routes (`/api/*`), which run server-side and use Prisma to read/write PostgreSQL. NextAuth issues a JWT session; route access is gated by `middleware.ts`, and every event mutation checks the user's group membership and records an activity log entry for attribution.

```
app/
  api/               REST-style routes: auth, register, groups, invitations, events
  login, register    Auth pages (+ one-click demo login)
  invite/[token]     Accept-invitation landing page
  page.tsx           The calendar app shell
components/          CalendarView, EventModal, Sidebar, AuthForm
lib/                 auth (NextAuth), prisma client, permissions, colors
prisma/
  schema.prisma      Users, groups, memberships, invitations, events, activity log
  seed.ts            Demo account + sample team
middleware.ts        Protects routes; redirects to /login when signed out
```

---

## Run it locally

**1. Get a free PostgreSQL database.** Create a project at [neon.tech](https://neon.tech) and copy the Prisma connection string.

**2. Configure environment.**

```bash
cp .env.example .env
```

Then in `.env`, paste your Neon URL into `DATABASE_URL` and set a `NEXTAUTH_SECRET` (generate one with `openssl rand -base64 32`).

**3. Install, create tables, seed, run.**

```bash
npm install
npx prisma db push      # creates all tables in your database
npx prisma db seed      # adds the demo account + sample data (optional)
npm run dev
```

Open **http://localhost:3000**. Use **"Try the demo"** or `demo@demo.com` / `demodemo`.

> Google sign-in is optional — leave the Google vars blank to use email/password only. To enable it, create an OAuth client in Google Cloud with redirect URI `<NEXTAUTH_URL>/api/auth/callback/google`.

## Deploy (Vercel + Neon)

See **[DEPLOY.md](DEPLOY.md)** for the full step-by-step. In short: create a Neon database, push this repo to GitHub, import it into Vercel, set the environment variables, run `prisma db push` against the production database, and (optionally) point a custom subdomain at Vercel.

---

## A note on production hosting

This started as an internal tool. The interesting real-world lesson: the company's existing hosting could only serve **static HTML/PHP** (file upload via SFTP through a bastion server), which can't run a Node.js app with a database — and company-data policy ruled out cloud hosting. That combination is a genuine wall: you can't be both "online for everyone" and "data strictly on a server that can only serve files." So this version is deployed as a public demo on Vercel with sample data. The same codebase would run unchanged on a company-owned Linux VM (or via Docker) with an internal PostgreSQL, if that infrastructure were available — only the `DATABASE_URL` would change.

## License

[MIT](LICENSE) © Jason Ng
