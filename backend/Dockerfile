FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./

# bcrypt needs native build tools on Alpine
RUN apk add --no-cache python3 make g++ && \
    npm ci --omit=dev && \
    apk del python3 make g++

COPY server.js ./
COPY database/ ./database/
COPY routes/ ./routes/
COPY services/ ./services/

EXPOSE 8080

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

CMD ["node", "server.js"]
