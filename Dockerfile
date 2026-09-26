FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
RUN mkdir -p work/uploads && chown -R node:node work
USER node
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["npm", "start"]
