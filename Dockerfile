# Multi-stage Docker build for Managarr

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production

COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/ ./

# Stage 3: Production image
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S managarr -u 1001 -G nodejs

WORKDIR /app

# Copy backend
COPY --from=backend-builder --chown=managarr:nodejs /app/backend ./backend
COPY --chown=managarr:nodejs package*.json ./

# Copy frontend build
COPY --from=frontend-builder --chown=managarr:nodejs /app/frontend/build ./frontend/build

# Create necessary directories
RUN mkdir -p /app/config /app/data /app/logs && \
    chown -R managarr:nodejs /app

# Install root package dependencies
RUN npm ci --only=production && npm cache clean --force

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node backend/healthcheck.js || exit 1

# Switch to non-root user
USER managarr

# Expose port
EXPOSE 3000

# Volume for configuration and data
VOLUME ["/app/config", "/app/data"]

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV CONFIG_PATH=/app/config
ENV DATA_PATH=/app/data

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "backend/server.js"]