# Add DATABASE_URL to Vercel

## The Issue
Your Next.js app needs `DATABASE_URL` to connect to the PostgreSQL database on your VPS.

## Connection String Format

Your database connection string should be:
```
postgresql://polytrade:PASSWORD@206.189.70.100:5432/polytrade
```

**Important**: Replace `PASSWORD` with your actual database password (URL-encoded if it contains special characters).

## Special Characters in Password

If your password contains special characters (like `*`, `/`, etc.), you need to URL-encode them:
- `*` becomes `%2A`
- `/` becomes `%2F`
- `@` becomes `%40`
- etc.

## Steps to Add to Vercel

1. **Go to Vercel Dashboard**:
   - Navigate to: https://vercel.com/dashboard
   - Select your project (PolyTrade/PolyVec)

2. **Go to Settings**:
   - Click **"Settings"** tab
   - Click **"Environment Variables"** in the left sidebar

3. **Add DATABASE_URL**:
   - Click **"Add New"**
   - **Key**: `DATABASE_URL`
   - **Value**: `postgresql://polytrade:YOUR_PASSWORD@206.189.70.100:5432/polytrade`
   - **Environments**: Select all (Production, Preview, Development)
   - Click **"Save"**

4. **Redeploy**:
   - After adding the variable, you need to redeploy
   - Go to **"Deployments"** tab
   - Click **"..."** (three dots) on the latest deployment
   - Click **"Redeploy"**
   - Or push a new commit to trigger a new deployment

## Important Security Notes

⚠️ **Make sure your VPS database is accessible from Vercel's servers:**
- Your VPS firewall must allow connections from Vercel's IP ranges
- PostgreSQL must be configured to accept remote connections
- Consider using SSL for the connection (the code already handles this)

## Testing the Connection

After adding the variable and redeploying:
1. Try logging in again on polyvec.com
2. Check Vercel logs if it still fails
3. Verify the database is accessible from external IPs

## Alternative: If Database Isn't Publicly Accessible

If your VPS database isn't accessible from Vercel, you have two options:

1. **Make it accessible** (recommended for now):
   - Configure PostgreSQL to accept remote connections
   - Update firewall rules
   - Use SSL connection

2. **Use a database proxy** (more secure):
   - Set up a secure tunnel/proxy
   - Use a service like Cloudflare Tunnel
   - Or use a managed database service

