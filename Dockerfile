# Production image: Backend API + admin dashboard static files.
#
# Dokploy Backend service:
#   Build context / root directory: .  (repository root)
#   Dockerfile path: Dockerfile
#
# Domains on this service: api.getkekeapp.com AND admin.getkekeapp.com

FROM node:18-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/ .
COPY admin/ ./admin-panel/

RUN mkdir -p uploads logs

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://localhost:8000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "src/server.js"]
