FROM node:20-alpine

RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nodejs

WORKDIR /app

COPY package*.json ./
# npm install (not ci): the lockfile is generated on dev machines (Windows/npm 11)
# and can omit Linux-only optional deps of devDependencies (e.g. vitest's native
# toolchain). `npm ci` validates the entire lockfile and fails on that mismatch
# even with --omit=dev; `npm install --omit=dev` reconciles it and still pins
# versions from the lockfile.
RUN npm install --omit=dev --no-audit --no-fund

COPY worker.js ./
COPY lib/ ./lib/
COPY services/ ./services/
COPY jobs/ ./jobs/
COPY routes/ ./routes/
COPY db/ ./db/
# Admin/one-off maintenance scripts (e.g. create-agreement-prices.js). Not run by
# the CMD — invoked on demand as a Cloud Run Job with the relevant secret bound.
COPY scripts/ ./scripts/

USER nodejs

EXPOSE 8080

CMD ["node", "worker.js"]
