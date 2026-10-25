FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# 依赖必须按 lockfile 安装，保证构建可复现
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
ARG API_INTERNAL_URL=http://backend:8080
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
