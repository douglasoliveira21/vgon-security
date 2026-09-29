# NEXT_PUBLIC_* variables are inlined into the client bundle at BUILD time, not read at
# container startup — so NEXT_PUBLIC_API_URL must be passed as a build arg (EasyPanel: set it
# under the app's "Build Args", not just "Environment Variables") pointing at the PUBLIC URL
# of the API service (its EasyPanel domain), not an internal service name.
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace apps/web --include-workspace-root
COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build --workspace apps/web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
