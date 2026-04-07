FROM node:22-alpine
WORKDIR /app

# Install dependencies for sharp
# hadolint ignore=DL3018
RUN apk add --no-cache vips-dev build-base python3

# Secure image: Create directories and set permissions before switching user
RUN mkdir -p uploads outputs && chown -R node:node /app

COPY --chown=node:node package*.json ./
RUN npm install

COPY --chown=node:node . .

USER node
EXPOSE 5000
CMD ["node", "server.js"]
