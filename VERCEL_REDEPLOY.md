# Fix CORS & 404 Error - Deployment Steps

## ✅ Changes Made

1. **Updated `Backend/index.js`**:
   - Added proper CORS configuration
   - Allowed your frontend domain: `https://product-inventory-frontend-beta.vercel.app`
   - Configured CORS methods and headers

2. **Created `Backend/vercel.json`**:
   - Configured Vercel to route all requests to `index.js`
   - Set Node.js as the runtime

## 🚀 Redeploy Backend on Vercel

### Option 1: Auto-Deploy (Recommended)
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Find your backend project (`product-inventory-delta-one`)
3. Vercel will auto-detect the new commit and redeploy
4. Wait 1-2 minutes for deployment to complete

### Option 2: Manual Redeploy
1. Go to your backend project on Vercel
2. Click **Deployments** tab
3. Click the **⋮** (three dots) on latest deployment
4. Click **Redeploy**

## ⚙️ Add Environment Variables (Important!)

In your Vercel backend project settings:

1. Go to **Settings** → **Environment Variables**
2. Add these variables:
   - **DATABASE_URL**: `postgresql://postgres.fccwwvymxdmeamhdtrsc:1kuorJiF2eSjLA9w@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
   - **NODE_ENV**: `production`
   - **PORT**: `8000` (optional)

3. Click **Save**
4. Redeploy the project

## ✅ Test After Deployment

### 1. Test Backend Health
Open in browser:
```
https://product-inventory-delta-one.vercel.app/
```
Should return: `{"ok":true}`

### 2. Test API Status
```
https://product-inventory-delta-one.vercel.app/api/status
```
Should return server and database info

### 3. Test Products Endpoint
```
https://product-inventory-delta-one.vercel.app/api/products
```
Should return product list (might be empty initially)

## 🔧 Troubleshooting

### Still Getting CORS Error?
1. Verify backend redeployed (check timestamp on Vercel)
2. Hard refresh frontend: `Ctrl + Shift + R`
3. Clear browser cache

### Still Getting 404?
1. Check `vercel.json` exists in Backend folder
2. Verify backend root directory is set to `Backend` in Vercel settings
3. Check Vercel build logs for errors

### Database Connection Error?
1. Verify `DATABASE_URL` is set in Vercel environment variables
2. Check Supabase project is active (not paused)
3. Test connection locally first: `npm run dev`

## 📝 Vercel Project Settings

Make sure your **Backend** project on Vercel has:

**Root Directory**: `Backend`  
**Framework Preset**: Other  
**Build Command**: (leave empty)  
**Output Directory**: (leave empty)  
**Install Command**: `npm install`  

## 🎯 Expected Result

After redeployment:
- ✅ CORS error should be gone
- ✅ 404 error should be fixed
- ✅ Frontend can fetch from backend
- ✅ Products will load in the UI

## 📱 Frontend URL
Your frontend: https://product-inventory-frontend-beta.vercel.app

## 🔗 Backend URL
Your backend: https://product-inventory-delta-one.vercel.app

---

**Next Steps:**
1. Wait for Vercel auto-deploy (~2 min)
2. Test the endpoints above
3. Refresh your frontend
4. Check if products load!

If issues persist, check the **Function Logs** in Vercel dashboard for detailed error messages.
