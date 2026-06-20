# Use lightweight Node 22 alpine image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy dashboard files
COPY index.html ./
COPY server.js ./

# Expose port (Cloud Run sets PORT env var)
EXPOSE 8080

# Start server
CMD ["node", "server.js"]
