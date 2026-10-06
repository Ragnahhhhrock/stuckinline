FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY public ./public
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
