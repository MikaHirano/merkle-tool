# Production Deployment Guide

This guide covers deploying the Merkle Tool application to production.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Backend server (required for Bitcoin OpenTimestamps functionality)
- OpenTimestamps calendar server access (public servers, no configuration needed)

## Environment Variables

See `.env.example` for a complete template. Copy it to `.env` and fill in your values.

### Frontend (.env)

Create a `.env` file in the project root:

```bash
VITE_BACKEND_URL=https://your-backend-server.com
```

**Important:** Environment variables prefixed with `VITE_` are exposed to the client-side code. Do not put sensitive information here.

### Backend

Required environment variables:

```bash
# Backend server port (default: 3001)
PORT=3001

# Node environment - MUST be set to 'production' for production deployment
NODE_ENV=production

# CORS allowed origins (comma-separated, REQUIRED in production)
# Example: CORS_ORIGIN=https://your-frontend-domain.com,https://www.your-frontend-domain.com
CORS_ORIGIN=https://your-frontend-domain.com
```

**Critical:** In production, you MUST:
1. Set `NODE_ENV=production` to enable security features
2. Set `CORS_ORIGIN` to restrict CORS to your frontend domain(s)

## Building for Production

### Frontend Build

```bash
npm install
npm run build
```

This creates an optimized production build in the `dist/` directory.

### Backend Setup

**Important**: The backend server is **required** for Bitcoin timestamping functionality. It cannot be skipped in production.

The backend server (`backend-server.js`) acts as a proxy between the frontend and OpenTimestamps calendar servers. It should be run as a Node.js process. Options:

1. **PM2 (Recommended)**
   ```bash
   npm install -g pm2
   pm2 start backend-server.js --name opentimestamps-backend
   pm2 save
   pm2 startup  # For auto-start on system boot
   ```

2. **Docker**
   Create a `Dockerfile`:
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY backend-server.js .
   EXPOSE 3001
   ENV NODE_ENV=production
   ENV PORT=3001
   # Set CORS_ORIGIN in docker-compose.yml or docker run command
   CMD ["node", "backend-server.js"]
   ```
   
   **Docker Compose Example:**
   ```yaml
   version: '3.8'
   services:
     opentimestamps-backend:
       build: .
       ports:
         - "3001:3001"
       environment:
         - NODE_ENV=production
         - PORT=3001
         - CORS_ORIGIN=https://your-frontend-domain.com
       restart: unless-stopped
   ```

3. **Systemd Service**
   Create `/etc/systemd/system/opentimestamps-backend.service`:
   ```ini
   [Unit]
   Description=OpenTimestamps Backend Server
   After=network.target

   [Service]
   Type=simple
   User=your-user
   WorkingDirectory=/path/to/merkle-folder
   Environment="NODE_ENV=production"
   Environment="PORT=3001"
   Environment="CORS_ORIGIN=https://your-frontend-domain.com"
   ExecStart=/usr/bin/node backend-server.js
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

## Deployment Checklist

### Frontend
- [ ] Set `VITE_BACKEND_URL` environment variable
- [ ] Run `npm run build`
- [ ] Deploy `dist/` directory to your hosting service (Vercel, Netlify, etc.)
- [ ] Configure CORS on backend if needed
- [ ] Test production build locally with `npm run preview`

### Backend (Required for Bitcoin Timestamping)
- [ ] Set `NODE_ENV=production` (REQUIRED for security)
- [ ] Set `CORS_ORIGIN` with your frontend domain(s) (REQUIRED in production)
- [ ] Set `PORT` environment variable (optional, defaults to 3001)
- [ ] Install dependencies: `npm install` (includes `opentimestamps`, `express-rate-limit`, `express`, `cors`)
- [ ] Start backend server (PM2, Docker, or systemd)
- [ ] Verify backend health endpoint: `curl http://your-backend:3001/api/health`
- [ ] Test stamp endpoint: `curl -X POST http://your-backend:3001/api/stamp -H "Content-Type: application/json" -d '{"merkleRootHex":"a1b2c3d4..."}'`
- [ ] Test rate limiting: Make multiple rapid requests (should be rate limited)
- [ ] Test CORS: Verify requests from unauthorized origins are rejected
- [ ] Test OpenTimestamps connectivity: Verify backend can reach calendar servers
- [ ] Configure firewall/security groups to allow traffic on port 3001
- [ ] Set up SSL/TLS certificate (HTTPS) for production
- [ ] Configure reverse proxy (nginx, Apache) if needed
- [ ] Set up monitoring/alerting for backend availability

## Security Features

The backend includes the following security measures:

### 1. CORS Protection
- **Development**: Allows all origins
- **Production**: Restricted to origins specified in `CORS_ORIGIN` environment variable
- **Configuration**: Set `CORS_ORIGIN` to comma-separated list of allowed origins

### 2. Rate Limiting
- **General API**: 100 requests per 15 minutes per IP
- **Stamp endpoint**: 20 requests per 15 minutes per IP
- **Upgrade endpoint**: 30 requests per minute per IP
- Prevents DoS attacks and abuse

### 3. Request Size Limits
- **JSON payloads**: Limited to 1MB
- **OTS files**: Maximum 1MB
- Prevents memory exhaustion attacks

### 4. Request Timeouts
- **30-second timeout** for stamp and upgrade endpoints
- Prevents resource exhaustion from hanging requests

### 5. Input Validation
- Hex string format validation
- Array size and content validation
- OTS file format validation
- Prevents malformed input attacks

### 6. Error Sanitization
- **Production**: Generic error messages (no stack traces or internal details)
- **Development**: Full error details for debugging
- Prevents information leakage

### 7. Environment-Based Security
- Security features automatically enabled when `NODE_ENV=production`
- Development mode allows all origins and shows debug logs

## Security Checklist

- [ ] Set `NODE_ENV=production` in backend environment
- [ ] Configure `CORS_ORIGIN` with your frontend domain(s)
- [ ] Use HTTPS for both frontend and backend
- [ ] Never commit `.env` files (use `.env.example` as template)
- [ ] Review rate limiting limits (adjust if needed for your use case)
- [ ] Set up monitoring/alerting for rate limit violations
- [ ] Configure firewall/security groups appropriately
- [ ] Set up SSL/TLS certificates
- [ ] Consider adding additional logging/monitoring (e.g., Sentry, LogRocket)

## Monitoring

### Backend Monitoring

- **Health checks**: Monitor backend server health: `GET /api/health`
- **Process monitoring**: Set up process monitoring (PM2, systemd, or container orchestration)
- **Error logs**: Monitor error logs for uncaught exceptions
- **API usage**: Track API usage and performance
- **OpenTimestamps connectivity**: Monitor connectivity to calendar servers
- **Rate limit violations**: Track rate limit violations for potential abuse

### Frontend Monitoring

- **Backend connectivity**: Monitor frontend's ability to reach backend server
- **User errors**: Track user-facing errors related to Bitcoin timestamping
- **Status polling**: Monitor automatic polling behavior and upgrade success rates

### Recommended Monitoring Tools

- **PM2**: Built-in monitoring with `pm2 monit`
- **Health check endpoints**: Use `/api/health` for load balancer health checks
- **Log aggregation**: Consider services like LogRocket, Sentry, or Datadog
- **Uptime monitoring**: Use services like UptimeRobot or Pingdom

## Troubleshooting

### Backend Connection Refused
- Verify backend is running: `curl http://localhost:3001/api/health`
- Check firewall/security group settings
- Verify `VITE_BACKEND_URL` matches backend URL
- Check backend logs for startup errors
- Verify Node.js version: `node --version` (should be 18+)
- Check if port 3001 is already in use: `lsof -i :3001` or `netstat -an | grep 3001`

### CORS Errors
- Verify `CORS_ORIGIN` environment variable is set correctly
- Check that frontend URL matches one of the allowed origins in `CORS_ORIGIN`
- Ensure `NODE_ENV=production` is set (CORS restrictions only apply in production)
- Check backend logs for CORS rejection messages

### Build Errors
- Clear `node_modules` and `dist`: `rm -rf node_modules dist && npm install`
- Verify Node.js version: `node --version` (should be 18+)
- Check for TypeScript/ESLint errors: `npm run lint`

### Bitcoin Timestamping Issues

**Backend Not Running:**
- Frontend will show "Backend server unavailable" error
- Start backend: `npm run backend` or use PM2/Docker/systemd
- Verify backend health: `curl http://your-backend:3001/api/health`

**Timestamp Stuck in Pending:**
- Check backend logs for OpenTimestamps errors
- Verify backend can reach calendar servers (check network connectivity)
- Try manual upgrade check using "Check Upgrade" button
- Wait longer (Bitcoin blocks take ~10 minutes on average)

**Rate Limiting:**
- If you hit rate limits, wait for the limit window to expire
- Adjust rate limits in `backend-server.js` if needed for your use case
- Consider implementing user authentication for higher limits

**CORS Errors:**
- Verify `CORS_ORIGIN` includes your frontend domain
- Check that `NODE_ENV=production` is set (CORS restrictions only apply in production)
- Verify frontend URL matches one of the allowed origins exactly (including protocol and port)

## Production URLs

After deployment, update:
- Frontend URL in backend CORS configuration (`CORS_ORIGIN` environment variable)
- Backend URL in frontend `.env` file (`VITE_BACKEND_URL`)
- Documentation and README with production URLs

## Bitcoin OpenTimestamps Architecture

### How It Works

1. **Frontend** (`src/components/BitcoinTimestamping.jsx`):
   - User initiates timestamp creation
   - Sends Merkle root to backend via `/api/stamp` endpoint
   - Receives initial `.ots` file
   - Automatically polls `/api/upgrade` endpoint with exponential backoff
   - Displays status updates (pending → anchored → confirmed)

2. **Backend** (`backend-server.js`):
   - Receives stamp requests, uses `OpenTimestamps.DetachedTimestampFile.fromHash()` to create timestamp
   - Submits to OpenTimestamps pool servers (aggregation endpoints)
   - Receives upgrade requests, queries calendar servers for Bitcoin attestations
   - Returns upgraded `.ots` files and attestation status
   - Implements security: CORS, rate limiting, input validation, timeouts

3. **OpenTimestamps Calendar Servers**:
   - Public calendar servers aggregate timestamps
   - Include timestamps in Bitcoin transactions
   - Provide upgrade endpoints for checking attestations

### Security Considerations

- **No double-hashing**: Merkle root (32-byte digest) is timestamped directly, not re-hashed
- **Input validation**: Backend validates all inputs (hex format, array sizes, OTS file format)
- **Rate limiting**: Prevents abuse and DoS attacks
- **Request timeouts**: Prevents resource exhaustion
- **Error sanitization**: Production errors don't leak internal details
- **CORS protection**: Only allows requests from configured frontend domains

### Calendar Servers Used

**Pool Servers** (for stamping):
- `https://a.pool.opentimestamps.org`
- `https://b.pool.opentimestamps.org`
- `https://a.pool.eternitywall.com`
- `https://ots.btc.catallaxy.com`

**Calendar Servers** (for upgrading):
- `https://alice.btc.calendar.opentimestamps.org`
- `https://bob.btc.calendar.opentimestamps.org`
- `https://finney.calendar.eternitywall.com`
- `https://ots.btc.catallaxy.com`

These are public servers maintained by the OpenTimestamps community. No configuration is required.

