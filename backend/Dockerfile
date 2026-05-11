FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads logs

# Expose port
EXPOSE 8000

# Health check
#
# Tuning history: 3s timeout / 3 retries was too tight for /driver/create —
# during a 4-image upload the event loop can stay busy long enough to miss
# two 3s probes back-to-back, Swarm marks the task unhealthy, sends SIGTERM
# mid-request, and the user gets a 502 Bad Gateway. Bumping timeout to 10s
# and retries to 5 gives us up to ~150s of cumulative tolerance before
# Swarm replaces the task, which is comfortably more than any realistic
# upload window without making genuinely dead containers stay around too
# long. start-period stays small because the app boots in <5s.
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://localhost:8000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "src/server.js"]
