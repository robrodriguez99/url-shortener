FROM node:24-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./

FROM base AS development

RUN npm ci

COPY . .

CMD ["npm", "run", "dev"]

FROM base AS build

RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

FROM node:24-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000

CMD ["npm", "start"]

