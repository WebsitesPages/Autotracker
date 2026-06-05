# Volles Debian-Image, damit better-sqlite3 zur Not nativ kompiliert werden kann
FROM node:20-bookworm

# Build-Werkzeuge für native Module (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Erst nur die Manifeste kopieren (besseres Layer-Caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Restlichen Code kopieren
COPY . .

# Datenverzeichnis (wird per Volume überschrieben/persistiert)
ENV DATA_DIR=/app/data
ENV PORT=3000
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
