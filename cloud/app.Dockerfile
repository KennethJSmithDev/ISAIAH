FROM node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
WORKDIR /opt/isaiah
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server.mjs runtime.mjs provider-profiles.mjs learning.mjs verifier.mjs LICENSE NOTICE.md ./
COPY --chown=node:node standalone/ ./standalone/
COPY --chown=node:node learning/ ./learning/
COPY --chown=node:node chatgpt/ ./chatgpt/
COPY --chown=node:node web/ ./web/
COPY --chown=node:node docs/ ./docs/
ENV NODE_ENV=production ISAIAH_COMPOSE=1
USER node
EXPOSE 18747
HEALTHCHECK --interval=10s --timeout=4s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:18747/api/state').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.mjs"]
