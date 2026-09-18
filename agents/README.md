# Keke Agent Console

Mobile-first web app for field agents onboarding drivers. Served like admin.

## Local preview

```bash
npm run agents
# http://localhost:3001
```

Backend must be running (`cd backend && npm run dev`).

## Login

Agents who already have a Keke account (rider or driver) enter that **email or phone**. A login OTP is sent on the existing auth path — there is no Firebase account and no password.

Harrison / Samuel add an agent in **Admin → Agents** (or `cd backend && npm run create:agent -- +2348…`).

## Production (Dokploy)

1. Application with build context **`agents`**, Dockerfile **`Dockerfile`**, port **80**
2. Domain: **`agents.getkekeapp.com`**
3. Add `https://agents.getkekeapp.com` to API `CORS_ORIGIN`
