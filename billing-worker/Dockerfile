FROM node:20-alpine

RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nodejs

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY worker.js ./
COPY lib/ ./lib/
COPY services/ ./services/
COPY jobs/ ./jobs/
COPY routes/ ./routes/

USER nodejs

EXPOSE 8080

CMD ["node", "worker.js"]
