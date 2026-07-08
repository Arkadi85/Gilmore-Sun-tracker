# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies using the lockfile for reproducible builds
COPY package.json package-lock.json ./
RUN npm ci

# Build the static site
COPY . .
RUN npm run build

# --- Runtime stage ---
FROM nginx:alpine AS runtime

# Serve on port 7685
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 7685

CMD ["nginx", "-g", "daemon off;"]
