# Agents Battle Royale

This repository is organized as a pnpm workspace.

- `frontend/` contains the existing Next.js application.
- `backend/` contains the Bun HTTP API server, OpenAI agent runner, and Vercel Sandbox code execution integration.

## Getting Started

Install dependencies from the repository root:

```bash
pnpm install
```

Create `backend/.env` with your local backend configuration:

```env
OPENAI_API_KEY=sk-...
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
JWT_SECRET=replace-with-a-long-random-secret
FRONTEND_ORIGIN=http://localhost:3000
```

The backend uses Vercel Sandbox to run generated Python code in isolated sandboxes. To run locally, each developer needs Vercel Sandbox auth on their own machine.

From the backend directory, link a Vercel project and pull a local OIDC token:

```bash
cd backend
vercel link
vercel env pull .env.local
cd ..
```

You can link either:

- A Vercel project you created for this app.
- A shared Vercel project, if the project owner has added you as a collaborator.

Do not commit `.env`, `.env.local`, or `.vercel/`. The local `VERCEL_OIDC_TOKEN` from `vercel env pull` expires periodically, so rerun `vercel env pull .env.local` if sandbox authentication starts failing.

Run both development servers from the repository root:

```bash
pnpm dev
```

This starts:

- Backend API: `http://localhost:4000`
- Frontend app: `http://localhost:3000`

You can also run each workspace separately:

```bash
pnpm --filter @agents-battle-royale/backend dev
pnpm --filter @agents-battle-royale/frontend dev
```

## Local Environment Variables

Backend variables:

- `OPENAI_API_KEY`: Required for agent model calls.
- `ADMIN_USERNAME`: Optional, defaults to `admin`.
- `ADMIN_PASSWORD`: Optional, defaults to `admin`.
- `JWT_SECRET`: Optional for local experiments, but should be set.
- `FRONTEND_ORIGIN`: Optional, defaults include `http://localhost:3000`, `http://localhost:3001`, and `http://localhost:3002`.
- `PORT`: Optional, defaults to `4000`.

Frontend variables:

- `NEXT_PUBLIC_BACKEND_URL`: Optional, defaults to `http://localhost:4000`.

## Verification

Check the backend health endpoint:

```bash
curl http://localhost:4000/health
```

Run backend tests:

```bash
pnpm --filter @agents-battle-royale/backend test
```

Run the frontend build and backend typecheck:

```bash
pnpm build
```
