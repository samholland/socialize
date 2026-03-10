## Socialize (Prototype)

This is a Next.js prototype for ideating and mocking social campaigns with a three-pane workflow:

- Left pane: client > project > campaign tree
- Middle pane: campaign editor
- Right pane: live visual mockup with media upload and PNG export

The current version is intentionally client-first and lightweight.

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
- Local persistence in browser `localStorage`

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

## Next Steps (AWS-Backed V1)

Recommended low-ops stack:

- Static app hosting: S3 + CloudFront (or Amplify Hosting)
- API: API Gateway (HTTP API) + Lambda
- Database: DynamoDB
- Media storage: S3 with pre-signed upload URLs
- Auth (later): Cognito

Incremental rollout plan:

1. Replace local persistence with API-backed CRUD
2. Store uploaded media in S3 and persist media keys in DB
3. Add campaign versioning/history
4. Add managed authentication and role access
5. Add server-generated exports only if pixel-perfect output is required

## Notes

- This prototype currently stores all data in the browser.
- Uploaded media is not yet persisted across devices/sessions unless you wire S3/API support.
