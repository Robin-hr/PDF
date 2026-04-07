FROM node:20-alpine
WORKDIR /app

# Install dependencies for sharp
RUN apk add --no-cache vips-dev build-base python3

# Secure image: Create directories and set permissions before switching user
RUN mkdir -p uploads outputs && chown -R node:node /app

COPY --chown=node:node package*.json ./
RUN npm install

COPY --chown=node:node . .

USER node
EXPOSE 5000
CMD ["node", "server.js"]
