# Fixed Dockerfile for Render with all required dependencies
FROM node:18-bullseye-slim

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_SKIP_DOWNLOAD=true
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Install ALL required system dependencies for Chromium
RUN apt-get update && apt-get install -y \
    # Basic utilities
    wget \
    curl \
    ca-certificates \
    gnupg \
    # Font libraries
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-unifont \
    # Audio libraries
    libasound2 \
    libpulse0 \
    # Display and graphics libraries
    libnss3 \
    libnspr4 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    # GTK and Cairo libraries
    libgtk-3-0 \
    libgtk-4-1 \
    libgconf-2-4 \
    # CUPS library (THE MISSING ONE!)
    libcups2 \
    libcups2-dev \
    # X11 libraries
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcursor1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrender1 \
    libxtst6 \
    # Additional required libraries
    libatspi2.0-0 \
    libcairo2 \
    libcairo-gobject2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    # Process management
    procps \
    # Cleanup
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy package files first for better caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Install Playwright and browsers with system dependencies
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Create non-root user for security
RUN groupadd -r hrbot && useradd -r -g hrbot -G audio,video hrbot \
    && mkdir -p /home/hrbot/Downloads \
    && chown -R hrbot:hrbot /home/hrbot \
    && chown -R hrbot:hrbot /app

# Copy application code
COPY --chown=hrbot:hrbot . .

# Create necessary directories
RUN mkdir -p logs screenshots && chown -R hrbot:hrbot /app

# Switch to non-root user
USER hrbot

# Expose port for Render
EXPOSE 10000

# Health check
HEALTHCHECK --interval=60s --timeout=30s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

# Start the bot
CMD ["npm", "start"]
