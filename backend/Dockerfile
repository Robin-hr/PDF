FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache vips-dev build-base python3
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p uploads outputs
EXPOSE 5000
CMD ["node", "server.js"]
