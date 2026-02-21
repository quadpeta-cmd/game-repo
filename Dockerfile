FROM node:20-alpine AS build
WORKDIR /app

COPY apps/web/package.json ./apps/web/package.json
RUN cd apps/web && npm install

COPY apps/web ./apps/web
RUN cd apps/web && npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
