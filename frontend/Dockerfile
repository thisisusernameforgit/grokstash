ARG NODE_VERSION=20-alpine
ARG NGINX_VERSION=1.26-alpine

FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:${NGINX_VERSION}
COPY --from=builder /app/dist /usr/share/nginx/html
