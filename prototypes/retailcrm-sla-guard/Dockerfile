FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY data ./data
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
