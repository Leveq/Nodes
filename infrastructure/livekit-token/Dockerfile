FROM node:20-alpine
WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

ENV PORT=8790
EXPOSE 8790

# Basic container healthcheck against the /health route.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8790/health || exit 1

CMD ["node", "server.mjs"]
