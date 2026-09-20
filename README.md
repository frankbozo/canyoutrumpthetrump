# Can You Trump the Trump?

A satire forum. Readers file invented policy proposals, vote on them, and flag the
ones reality has already caught up with.

No build step, no framework. Node + Express + Postgres, plain HTML/CSS/JS on the front.
You can read every file in this repo in about twenty minutes.

---

## Deploying it (about 20 minutes)

### 1. Get a database

Go to **[neon.tech](https://neon.tech)** and create a free project. Free there is
genuinely free and the data persists — unlike most free Postgres tiers, which expire.
Copy the connection string it gives you; it looks like:

```
postgresql://user:password@ep-something.aws.neon.tech/neondb?sslmode=require
```

### 2. Put this code on GitHub

Create an empty repository, then from this folder:

```bash
git init
git add .
git commit -m "Initial site"
git remote add origin https://github.com/YOUR-NAME/canyoutrumpthetrump.git
git push -u origin main
```

### 3. Deploy

Go to **[render.com](https://render.com)**, choose **New → Web Service**, and point it
at the repository. Render reads `render.yaml` and fills in most of the settings itself.

The one thing it can't fill in is the database. In the service's **Environment** tab,
add:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string from step 1 |

`SESSION_SECRET` and `ADMIN_KEY` are generated for you. **Open the Environment tab and
copy down `ADMIN_KEY`** — it's your password for `/admin`, and you'll want it shortly.

Deploy. The schema creates itself on first boot; there's no migration step to run.

### 4. Point your domain at it

In Render: **Settings → Custom Domains → Add**, enter `canyoutrumpthetrump.com`.
Render shows you the DNS records to create.

In GoDaddy: **My Products → DNS** for the domain, then add exactly the records Render
listed. Usually an `A` record for the root and a `CNAME` for `www`. Certificates are
issued automatically once DNS propagates — give it up to an hour.

Finally, set `SITE_ORIGIN` to `https://canyoutrumpthetrump.com` in Render so share
links and preview cards use the real domain.

---

## Running it locally

```bash
npm install
cp .env.example .env     # then fill in DATABASE_URL (Neon works fine for local too)
npm run dev
```

Open http://localhost:3000.

---

## Adding your starting proposals

`seed.json` is loaded **automatically on first boot** against an empty database, so a
fresh deploy is never a blank site and you don't need shell access on the host. It runs
only when the posts table is empty — restarts and redeploys never duplicate anything, and
it can never touch what people have published since.

Edit `seed.json` before you deploy. The format:

```json
[
  {
    "headline": "Your proposal, written straight",
    "body": "Two or three sentences of deadpan justification.",
    "author": "PatriotPhysicist",
    "desk": "general"
  }
]
```

To add more to a site that's already live, edit `seed.json` and redeploy won't pick it
up (the table isn't empty any more) — use the manual loader instead, if you have a
terminal:

```bash
npm run seed
```

Safe to re-run either way: anything already on file is skipped rather than duplicated.

---

## Running the site day to day

**`/admin`** is the desk editor. Sign in with `ADMIN_KEY`. Three tabs: pending
proposals, held comments, and reports. Nothing reaches the public feed until you
approve it, as long as `REQUIRE_APPROVAL` stays `true`.

When you trust the flow enough to stop gatekeeping, set `REQUIRE_APPROVAL=false`.
Submissions then go live immediately — except anything that trips the content
tripwire in `src/lib.js`, which is always held for review regardless.

**Before you launch**, open `/terms` and replace the placeholder contact line with a
real address people can send takedown requests to. It's the one piece of content
left deliberately blank.

---

## How the mechanics work

**Voting.** Each visitor gets a signed, httpOnly cookie. One vote per proposal;
clicking the same arrow again clears it. Counts are recalculated from the votes table
rather than incremented, so a retried request can't double-count.

This stops casual double-voting, not a determined person with a fresh browser profile.
That's the correct amount of effort for a joke site. If it ever matters, the upgrade is
accounts, not a cleverer cookie.

**Black mark.** A proposal is marked when downvotes exceed 35% of its votes *and* it has
at least 10 votes total. The floor is the important half: without it, two downvotes kill
every new submission before anyone sees it. Both numbers are at the top of `src/lib.js`.

**Reality Check.** Any reader can flag a proposal as already having happened, and must
supply a link to the real story. Three independent flags move it permanently to
`/reality` with its sources attached.

This is the mechanic worth protecting. It's the only part of the site that gets better
over time instead of staler, and it's what gives people a reason to come back.

**Plausibility Index.** Readers rate each proposal 0–100% on how likely it actually is.
The crowd average shows next to the headline, deadpan. The comedy is in the high numbers.

**Rate limits.** Five submissions per IP per hour, twenty comments per ten minutes,
fifteen reports per hour. In-memory, so they reset on restart and assume a single
instance. Fine at this scale; move them to the database if you ever run more than one.

**Share cards.** Every proposal page carries its own OpenGraph tags, so a pasted link
previews with that headline and a `SATIRE —` prefix. The **Share** button also draws a
PNG on a canvas with the satire label baked into the pixels, so it survives being
screenshotted and reposted stripped of context.

---

## The satire labelling, and why it's everywhere

The format of this site — plausible-sounding policy headlines, presented straight — is
exactly the format that gets screenshotted and passed off as real. That's the joke and
it's also the liability, so the label is structural rather than a disclaimer at the
bottom of a page nobody opens:

- a `SATIRE` badge in the masthead, on every page
- `SATIRE —` prefixed to every share preview description
- the label burned into the generated share image
- a plain-English statement in the footer of every page
- `/terms`, with posting rules and a takedown route
- `robots.txt` asking crawlers not to republish it as news

Leave all of it in. It costs nothing comedically and it's what keeps the site off the
wrong end of a platform ban, an ad-network rejection, or a complaint you'd rather not
receive.

---

## Layout

```
src/
  server.js    routes — API and the server-rendered page shells
  db.js        connection pool and the schema (created on boot)
  lib.js       voting cookies, rate limits, scoring, content tripwire
  views.js     the HTML shell, including per-post OpenGraph tags
  seed.js      loads seed.json
public/
  app.js       the whole front end
  styles.css   design tokens, light and dark
  og-default.png, favicon.svg, robots.txt
seed.json      your starting proposals (empty)
render.yaml    Render deployment config
```

## What to build next

In the order I'd do it:

1. **A weekly issue.** Freeze each week's top proposals as `Vol. N` and archive it.
   Gives people a reason to return on a schedule and gives you something to email.
2. **Prophet scoring.** Award points to whoever filed a proposal that later gets
   overtaken. A leaderboard of the most prophetic citizens is the natural companion
   to the Reality Check, and it's mostly a query you already have the data for.
3. **Email digest.** The list is the only asset that survives the joke going stale.
4. **Desk pages.** `/desk/economy` and friends — the schema already stores `desk`,
   nothing surfaces it yet.
5. **Accounts**, but only if vote integrity ever actually becomes a problem. It's a
   real cost in friction and you should make the site earn it first.
