FROM node:20-alpine

WORKDIR /app

# Copy Backend files
COPY . .

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8000

# Expose port
EXPOSE 8000

# Start Backend API
CMD ["node", "local_proxy.js"]

