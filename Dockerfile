# ---------- BACKEND BUILD ----------
FROM node:20-alpine AS backend-builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY app.js ./
COPY server.js ./
COPY src ./src

# Use pre-built frontend dist (committed to git — no Vite build needed on Render)
COPY frontend/dist ./frontend/dist


# ---------- PRODUCTION SETTINGS ----------
ENV NODE_ENV=production

# Render uses dynamic port → MUST support this
ENV PORT=3000

EXPOSE 3000

# ✅ Important: handle crashes properly
CMD ["node", "server.js"]