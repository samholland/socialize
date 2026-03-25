## Socialize (Prototype)

This is a Next.js prototype for ideating and mocking social campaigns with a three-pane workflow:

- Left pane: client > project > campaign tree
- Middle pane: campaign editor
- Right pane: live visual mockup with media upload and PNG export

The app now supports both:
- local-only mode (default when Supabase env vars are missing)
- cloud-backed mode (Supabase Auth + Postgres + Storage)

## Current Features

- Manage multiple clients, projects, and campaigns
- Edit campaign fields:
  - campaign name
  - platform
  - body copy
  - CTA
- Live preview canvas
  - drag-and-drop image/video
  - click-to-upload media
  - PNG export of the composed preview
- CSV export of the selected campaign's text metadata
- Local persistence in browser `localStorage` (local mode)
- Cloud persistence scoped to authenticated users (Supabase mode)
- Personal workspace auto-provisioning on first sign-in
- Optional organization workspaces (schema + RLS support)
- Private media uploads via signed upload/read URLs
- One-time prompt to import legacy local data into cloud workspace

## Getting Started

Run the development server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Useful commands:

```bash
npm run lint
npm run build
```

## Supabase Setup (Cloud Mode)

1. Create a Supabase project.
2. Run SQL migration:
   - `supabase/migrations/20260325_v1_backend.sql`
3. Create `.env.local` from `.env.example` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET` (optional, defaults to `campaign-media`)
4. Start app:
   - `npm run dev`

If Supabase env vars are not set, the app runs in local-only mode.

## Security Model (Cloud Mode)

- RLS enabled for app tables.
- Personal workspace access: owner only.
- Organization workspace access: members only.
- Organization management: owner only.
- Storage bucket is private; media access is signed URL + workspace authorization.
