FROM node:20-alpine

WORKDIR /app

# Install Gun directly
RUN npm init -y && npm install gun

# Copy relay script
COPY relay.mjs .

# Data volume for persistence
VOLUME /app/data

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --spider http://localhost:$PORT/ || exit 1

EXPOSE 8765

CMD ["node", "relay.mjs"]
