###############################################
# 1️⃣  Build stage – install dependencies
###############################################
FROM node:18-slim AS builder

# Prevent puppeteer / playwright from asking for any download questions
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/share/playwright-browsers \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy source so that Playwright can analyse it (needed to decide which browsers to fetch)
COPY . .

# Install ONLY Chromium for Playwright (saves ~200 MB)
RUN npx playwright install chromium --with-deps

###############################################
# 2️⃣  Runtime stage – copy only what is needed
###############################################
FROM node:18-slim

LABEL org.opencontainers.image.source="https://github.com/your-org/greythr-bot"
LABEL org.opencontainers.image.description="Telegram bot that punches in/out on GreytHR"

# -------------------------------------------------
# Runtime dependencies Playwright needs (fonts etc.)
# -------------------------------------------------
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libnss3 libatk-bridge2.0-0 libxkbcommon0 libxdamage1 libxcomposite1 \
        libxrandr2 libgbm1 libasound2 libxss1 libdrm2 libpangocairo-1.0-0 \
        ca-certificates fonts-liberation && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/usr/share/playwright-browsers \
    TZ=UTC

# Non-root user for security
RUN useradd --user-group --create-home --shell /bin/bash bot
WORKDIR /home/bot/app

# Copy node_modules and compiled browsers from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /usr/share/playwright-browsers /usr/share/playwright-browsers

# Copy application source
COPY . .

# (Optional) tiny health-check web server used by Replit/UptimeRobot etc.
#  – comment out if you don’t expose 3000
EXPOSE 3000

USER bot

CMD ["node", "index.js"]
