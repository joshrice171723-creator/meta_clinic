FROM node:24-alpine AS build
WORKDIR /web
RUN npm install --global pnpm@11.19.0 --ignore-scripts
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm run build
ARG RELEASE_REVISION=unversioned
RUN node -e "require('fs').writeFileSync('dist/build.json', JSON.stringify({revision:process.env.RELEASE_REVISION,version:require('./package.json').version,dirty:false}))"

FROM nginx:stable-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /web/dist /usr/share/nginx/html
RUN nginx -t
USER 101:101
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]
