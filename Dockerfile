FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY admin-shared.mjs cursor-direct-gateway.mjs cursor-gateway.mjs direct-admin-page.mjs ./

RUN mkdir -p /data

ENV CURSOR_DIRECT_HOST=0.0.0.0 \
    CURSOR_DIRECT_PORT=32126 \
    CURSOR_DIRECT_REQUIRE_API_KEY=true \
    CURSOR_DIRECT_AUTH_PATH=/data/auth.json \
    CURSOR_DIRECT_ACCOUNTS_PATH=/data/direct-accounts.json

EXPOSE 32126

CMD ["node", "./cursor-direct-gateway.mjs"]
