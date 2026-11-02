FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
COPY package.json ./
COPY src ./src
COPY content ./content
COPY scripts ./scripts
RUN mkdir -p /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
