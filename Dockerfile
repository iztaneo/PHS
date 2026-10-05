# Imágenes de PHS para probar la aplicación completa con Docker (ver docs/DOCKER.md).
# No es la imagen de producción: conserva las dependencias de desarrollo porque las migraciones
# y la carga de datos de demostración se ejecutan con ellas.

# ---- Compilación: instala con el lockfile y compila servicios y web.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.9.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm install --frozen-lockfile
RUN pnpm build

# ---- Servicios: gateway, Identidad, Proyectos, Salud y Plataforma comparten esta imagen;
#      cada contenedor arranca uno distinto. También ejecuta migraciones y semillas.
FROM node:24-bookworm-slim AS app
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
COPY db db
# Carpeta de evidencias, propiedad del usuario sin privilegios con el que corre la aplicación.
RUN mkdir -p /data/evidence && chown -R node:node /data
USER node

# ---- Web: archivos estáticos y el paso de /api al gateway, para que el navegador use un solo origen.
FROM nginx:1.29-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
