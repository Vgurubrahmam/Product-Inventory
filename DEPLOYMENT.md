# Product Inventory Management System - Deployment Guide

## Overview
This guide covers multiple deployment options for your Product Inventory Management System (React frontend + Node.js backend + SQLite).

---

## Option 1: Deploy to Render (Recommended - Free)

### Backend Deployment

1. **Prepare Backend for Deployment**
   - Ensure `Backend/package.json` has a start script (already configured)
   - SQLite database will be created automatically

2. **Deploy to Render**
   - Go to [render.com](https://render.com) and sign up
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `product-inventory-backend`
     - **Root Directory**: `Backend`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: Free
   - Add Environment Variable:
     - `PORT`: `8000` (or leave default)
   - Click "Create Web Service"
   - Copy the deployed URL (e.g., `https://product-inventory-backend.onrender.com`)

### Frontend Deployment

1. **Update Frontend API URL**
   - Create `Frontend/.env.production`:
     ```
     VITE_API_URL=https://product-inventory-backend.onrender.com
     ```

2. **Deploy to Render**
   - Click "New +" → "Static Site"
   - Connect your repository
   - Configure:
     - **Name**: `product-inventory-frontend`
     - **Root Directory**: `Frontend`
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `dist`
   - Click "Create Static Site"

---

## Option 2: Deploy to Vercel (Frontend) + Render (Backend)

### Backend on Render
Follow the backend steps from Option 1 above.

### Frontend on Vercel

1. **Install Vercel CLI** (optional)
   ```powershell
   npm install -g vercel
   ```

2. **Update Frontend API URL**
   - Create `Frontend/.env.production`:
     ```
     VITE_API_URL=https://your-backend-url.onrender.com
     ```

3. **Deploy via Vercel Dashboard**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your repository
   - Configure:
     - **Framework Preset**: Vite
     - **Root Directory**: `Frontend`
     - **Build Command**: `npm run build`
     - **Output Directory**: `dist`
   - Add Environment Variable:
     - `VITE_API_URL`: Your backend URL
   - Click "Deploy"

4. **Or Deploy via CLI**
   ```powershell
   cd Frontend
   vercel --prod
   ```

---

## Option 3: Deploy to Railway

### Full Stack Deployment

1. **Go to [railway.app](https://railway.app)**

2. **Deploy Backend**
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Click "Add variables" and set:
     - `PORT`: `8000`
     - `NODE_ENV`: `production`
   - Railway will auto-detect and deploy

3. **Deploy Frontend**
   - Add another service from the same repo
   - Set root directory to `Frontend`
   - Add environment variable:
     - `VITE_API_URL`: Your backend Railway URL
   - Deploy

---

## Option 4: Deploy to Heroku

### Backend Deployment

1. **Install Heroku CLI**
   ```powershell
   # Download from: https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Prepare Backend**
   - Ensure `Backend/package.json` has engines:
     ```json
     "engines": {
       "node": "18.x"
     }
     ```

3. **Deploy**
   ```powershell
   cd Backend
   heroku login
   heroku create product-inventory-backend
   git init
   git add .
   git commit -m "Deploy backend"
   git push heroku main
   ```

### Frontend Deployment
Use Vercel or Netlify (see options above).

---

## Option 5: VPS Deployment (DigitalOcean, AWS EC2, Linode)

### Prerequisites
- Ubuntu 22.04 server
- Domain name (optional)

### Setup Steps

1. **Connect to VPS**
   ```bash
   ssh root@your-server-ip
   ```

2. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

3. **Install Nginx**
   ```bash
   sudo apt update
   sudo apt install nginx
   ```

4. **Clone Repository**
   ```bash
   cd /var/www
   git clone https://github.com/yourusername/your-repo.git
   cd your-repo
   ```

5. **Setup Backend**
   ```bash
   cd Backend
   npm install
   pm2 start index.js --name inventory-backend
   pm2 save
   pm2 startup
   ```

6. **Setup Frontend**
   ```bash
   cd ../Frontend
   npm install
   npm run build
   ```

7. **Configure Nginx**
   ```bash
   sudo nano /etc/nginx/sites-available/inventory
   ```

   Add:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       # Frontend
       location / {
           root /var/www/your-repo/Frontend/dist;
           try_files $uri $uri/ /index.html;
       }

       # Backend API
       location /api {
           proxy_pass http://localhost:8000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   Enable site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/inventory /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

8. **Setup SSL (Optional)**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

---

## Option 6: Docker Deployment

### Create Dockerfiles

**Backend Dockerfile** (`Backend/Dockerfile`):
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8000
CMD ["npm", "start"]
```

**Frontend Dockerfile** (`Frontend/Dockerfile`):
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**docker-compose.yml** (root):
```yaml
version: '3.8'
services:
  backend:
    build: ./Backend
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./Backend/backend.sqlite:/app/backend.sqlite

  frontend:
    build: ./Frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    environment:
      - VITE_API_URL=http://localhost:8000
```

**Deploy**:
```powershell
docker-compose up -d
```

---

## Environment Variables Reference

### Backend
- `PORT`: Server port (default: 8000)
- `DB_PATH`: SQLite database path (default: ./backend.sqlite)
- `NODE_ENV`: Environment (production/development)

### Frontend
- `VITE_API_URL`: Backend API URL (default: http://localhost:8000)

---

## Post-Deployment Checklist

- [ ] Backend is accessible and returns `{"ok":true}` at `/api/status`
- [ ] Frontend loads without errors
- [ ] Products list displays correctly
- [ ] Search and filter work
- [ ] Can add, edit, delete products
- [ ] Import/Export CSV functions work
- [ ] Inventory history sidebar shows updates
- [ ] CORS is properly configured
- [ ] Database persists data (check after server restart)

---

## Troubleshooting

### CORS Errors
Add to `Backend/index.js`:
```javascript
app.use(cors({
  origin: ['https://your-frontend-domain.com'],
  credentials: true
}));
```

### Database Not Persisting (Render)
Render's free tier has ephemeral storage. Upgrade to paid plan or use:
- Railway (persistent disk)
- Supabase PostgreSQL (migrate from SQLite)
- MongoDB Atlas (requires schema changes)

### Build Failures
- Ensure all dependencies in `package.json`
- Check Node version compatibility
- Verify build commands in deployment settings

---

## Recommended Setup for Production

**Best combination for free tier:**
- **Frontend**: Vercel or Netlify (fast, free SSL, global CDN)
- **Backend**: Railway or Render (persistent storage on Railway)

**Best for scalability:**
- **Frontend**: Vercel with CDN
- **Backend**: AWS EC2 or DigitalOcean with PM2
- **Database**: PostgreSQL on Supabase or AWS RDS

---

## Need Help?

Common deployment platforms documentation:
- [Render Docs](https://render.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [Railway Docs](https://docs.railway.app)
- [Netlify Docs](https://docs.netlify.com)
