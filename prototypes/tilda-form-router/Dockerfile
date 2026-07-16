FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir -p /app/data && chown -R node:node /app

USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
