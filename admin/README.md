# Keke Admin Dashboard

Static admin UI served at `admin.getkekeapp.com`. API calls go to `api.getkekeapp.com`.

## Local preview

```bash
npm run admin
# http://localhost:3000
```

## Production deploy (Dokploy)

1. Add an **Application** service with build context **`admin`**, Dockerfile **`Dockerfile`**, port **80**
2. Domain: **`admin.getkekeapp.com`**
3. Enable auto-deploy on `main`

After deploy, hard refresh → **Configuration → Payment methods**.

Verify:

```bash
curl -s https://admin.getkekeapp.com/pages/Config.jsx | grep payment-methods
```
