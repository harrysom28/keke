# Keke Admin Dashboard

Static admin UI for `admin.getkekeapp.com`. API calls go to `api.getkekeapp.com`.

## Local preview

```bash
npm run admin
# http://localhost:3000
```

## Production (recommended): serve from Backend

The admin UI is bundled into the **Backend** Docker image so every Backend redeploy updates the admin files automatically.

### Dokploy — Backend service

| Setting | Value |
|---|---|
| Root directory | `.` (repository root) |
| Dockerfile | `Dockerfile` |
| Port | `8000` |
| Domains | `api.getkekeapp.com` **and** `admin.getkekeapp.com` |

After changing root directory / Dockerfile, **redeploy Backend**.

Remove `admin.getkekeapp.com` from any separate Admin/static service so traffic hits Backend.

### Verify

```bash
curl -s https://admin.getkekeapp.com/pages/Config.jsx | grep payment-methods
curl -s https://admin.getkekeapp.com/pages/Config.jsx | wc -c
# expect matches + ~60263 bytes
```

Then hard refresh → **Configuration → Payment methods**.

## Alternative: standalone Admin container

Use `admin/Dockerfile` only if you run a separate Admin app. You must point `admin.getkekeapp.com` exclusively to that service (remove any old static host).
