FROM mcr.microsoft.com/playwright:v1.60.0-noble as build

WORKDIR /repo

# Copy root workspace package files
COPY package*.json ./

# Copy workspace member package.json files (npm ci needs them to resolve workspace deps)
COPY frontend/package*.json ./frontend/
COPY packages/compare-core/package.json ./packages/compare-core/
COPY extension/package.json ./extension/

# Upgrade npm to fix lockfile resolution issues (Playwright image ships with npm 10.9.3)
# Pin to npm 11.x (compatible with Node 22.20.0; npm 12 requires Node >=22.22.2)
RUN npm install -g npm@11

# Install dependencies for the frontend workspace (uses root package-lock.json)
RUN npm ci -w frontend --include-workspace-root

# Copy frontend source code
COPY frontend ./frontend

# Shared package source (was passed via build-contexts in docker-compose)
COPY --from=core . ./packages/compare-core
# Model registry for SEO catalog generation (optional at source, required for fresh model pages)
COPY --from=registry models_registry.json /data/models_registry.json
ENV SEO_REGISTRY_PATH=/data/models_registry.json

# Set environment variable to fix crypto issue
ENV NODE_OPTIONS="--openssl-legacy-provider"

# The build will use environment variables passed in at build time
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# reCAPTCHA v3 site key (optional - can be empty for development)
ARG VITE_RECAPTCHA_SITE_KEY
ENV VITE_RECAPTCHA_SITE_KEY=${VITE_RECAPTCHA_SITE_KEY}

# Sentry error monitoring (optional - can be empty for development)
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}

ARG VITE_SENTRY_ENVIRONMENT
ENV VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}

ARG VITE_SENTRY_RELEASE
ENV VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE}

# Build the app with prerendering (Playwright is available in this image)
WORKDIR /repo/frontend
RUN npm run build

# For development (default)
FROM node:20-alpine as dev
WORKDIR /repo
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY packages/compare-core/package.json ./packages/compare-core/
COPY extension/package.json ./extension/
RUN npm install
COPY frontend ./frontend
COPY --from=core . ./packages/compare-core
WORKDIR /repo/frontend
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# For production with SSL (runs as root so nginx can read host-mounted certs and write to /var/cache/nginx)
FROM nginx:alpine as prod
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]