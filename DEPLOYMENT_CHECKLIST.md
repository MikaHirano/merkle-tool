# Production Deployment Checklist

## ✅ Completed (Automated)

- [x] Created `railway.json` - Railway deployment configuration
- [x] Created `Procfile` - Railway start command
- [x] Created `DEPLOYMENT.md` - Quick reference guide
- [x] Created `.env.production.example` - Template for production env vars
- [x] Verified backend syntax is valid
- [x] Verified Node.js version (v24.11.1) is compatible

## 📋 Next Steps (Manual - Follow Plan)

### Phase 2: Deploy Backend to Railway

1. **Go to Railway.app**
   - Sign up/login at https://railway.app
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Select your repository

2. **Configure Railway Service**
   - Railway should auto-detect Node.js
   - Verify Start Command: `node backend-server.js`
   - Root Directory: Leave blank (root is fine)

3. **Set Environment Variables in Railway**
   Go to "Variables" tab and add:
   ```
   NODE_ENV=production
   PORT=3001
   CORS_ORIGIN=https://your-vercel-app.vercel.app
   ```
   **Important:** Replace `your-vercel-app.vercel.app` with your actual Vercel domain

4. **Wait for Deployment**
   - Railway will auto-deploy
   - Check "Deployments" tab
   - Note your Railway backend URL (e.g., `https://your-backend.up.railway.app`)

5. **Test Backend**
   ```bash
   curl https://your-backend.up.railway.app/api/health
   ```
   Should return: `{"status":"ok"}`

### Phase 3: Configure Frontend

1. **Create `.env.production` locally** (optional, for reference)
   ```bash
   VITE_BACKEND_URL=https://your-backend.up.railway.app
   ```
   Note: This file is gitignored. Vercel will use dashboard env vars.

### Phase 4: Configure Vercel

1. **Go to Vercel Dashboard**
   - https://vercel.com
   - Select your project
   - Settings → Environment Variables

2. **Add Environment Variable**
   - Key: `VITE_BACKEND_URL`
   - Value: `https://your-backend.up.railway.app` (your Railway URL)
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Click "Save"

### Phase 5: Push to GitHub

**Before pushing, verify:**
- [ ] Railway backend deployed and tested
- [ ] Railway backend URL noted
- [ ] Vercel environment variables configured
- [ ] All changes committed locally

**Then push:**
```bash
git add railway.json Procfile DEPLOYMENT.md DEPLOYMENT_CHECKLIST.md .env.production.example
git commit -m "Add Railway deployment configuration and deployment guides"
git push origin main
```

**After push:**
- Vercel will auto-deploy
- Wait for deployment to complete
- Test your production app

### Phase 6: Verify Deployment

1. **Test Backend**
   ```bash
   curl https://your-backend.up.railway.app/api/health
   ```

2. **Test Frontend**
   - Open your Vercel URL
   - Go to "On-Chain Timestamping" → "Bitcoin"
   - Try creating a timestamp
   - Check browser console for errors

3. **Check Logs**
   - Railway: Check "Logs" tab for backend activity
   - Vercel: Check deployment logs

## Files Created

- `railway.json` - Railway configuration
- `Procfile` - Railway start command
- `DEPLOYMENT.md` - Quick deployment guide
- `DEPLOYMENT_CHECKLIST.md` - This checklist
- `.env.production.example` - Template (gitignored)

## Important Reminders

1. **Railway Backend URL**: You'll get this after deploying (e.g., `https://your-backend.up.railway.app`)
2. **Vercel Domain**: Your frontend domain (e.g., `https://your-app.vercel.app`)
3. **CORS_ORIGIN**: Must match your Vercel domain exactly (including https://)
4. **Environment Variables**: Set in Railway and Vercel dashboards (not in code)
5. **`.env.production`**: Gitignored - create locally if needed, but Vercel uses dashboard vars

## Troubleshooting

See `DEPLOYMENT.md` or `PRODUCTION.md` for detailed troubleshooting.

