FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspaces --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace packages/shared
RUN npm run --workspace apps/api prisma:generate
RUN npm run build --workspace apps/api

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/api ./apps/api
WORKDIR /repo/apps/api
RUN chmod +x docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
