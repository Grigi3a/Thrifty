FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 TRUST_PROXY=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
VOLUME /data
EXPOSE 3000
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--disable-warning=ExperimentalWarning","server/index.js"]
