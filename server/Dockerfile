# Registration API for Cloud Run. Build from the repository root:
#   gcloud builds submit --config server/cloudbuild.yaml --project iol2027
# (The Dockerfile at the root builds the static website, not this API.)
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
USER node
CMD ["node", "server/index.js"]
