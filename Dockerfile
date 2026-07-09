# ExamShuffle — server (Express + Puppeteer) serving the built React app.
FROM node:20-slim

# Chromium runtime libraries for Puppeteer + Hebrew/Latin fonts for the
# answer-key text rendered by headless Chrome. (Question/option pixels are
# copied from the source PDF, so those fonts come from the exam itself.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching. Puppeteer downloads its Chromium here.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install
# render.ts launches with headless:"shell" — ensure that binary is present.
RUN npx puppeteer browsers install chrome-headless-shell

# Build the web bundle (server serves web/dist in production).
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
