# Keke Admin Dashboard

Static admin UI served at `admin.getkekeapp.com`. It talks to the backend API (`api.getkekeapp.com`).

## Local preview

```bash
npm run admin
# http://localhost:3000
```

## Production deploy (Dokploy)

**Pushing to Git only redeploys Backend** unless you also have an Admin app in Dokploy.

1. In Dokploy → **Projects** → **keke** → **Add Service** → **Application**
2. Name: `Admin`
3. **Build type:** Dockerfile
4. **Build context / root directory:** `admin` (this folder)
5. **Dockerfile path:** `Dockerfile`
6. **Port:** `80`
7. **Domain:** `admin.getkekeapp.com`
8. Enable **Auto Deploy** on `main` branch pushes
9. Deploy

After deploy, open **Configuration** → you should see the **Payment methods** tab.

Verify deploy worked:

```bash
curl -s https://admin.getkekeapp.com/pages/Config.jsx | grep -c payment-methods
# should print 1 or more (0 = still old files)
```
