FROM node:22-alpine AS build

WORKDIR /app
ENV NODE_ENV=development

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=1234

RUN apk add --no-cache curl \
  && addgroup -S app \
  && adduser -S app -G app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts

USER app
EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-1234}/health" >/dev/null || exit 1

CMD ["node", "dist/index.js"]
