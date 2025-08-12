# 🎵 Ultra-Cheap Audio Downloader VPS Deployment ($3-4/month)

## 📋 Prerequisites

- VPS with Ubuntu 22.04 (2GB RAM, 2 vCPU recommended)
- SSH access to your VPS
- Domain name (optional - can use IP address)

## 🚀 Quick Deployment (5 minutes)

### Step 1: Connect to VPS
```bash
ssh root@YOUR_VPS_IP
```

### Step 2: Download and Run Setup Script
```bash
# Download the budget setup script
wget https://raw.githubusercontent.com/Paramfere/musicdownloader/main/budget-vps-setup.sh

# Make it executable
chmod +x budget-vps-setup.sh

# Run the setup (installs Node.js, yt-dlp, FFmpeg, etc.)
./budget-vps-setup.sh
```

### Step 3: Deploy the Application
```bash
# Download the deployment script
wget https://raw.githubusercontent.com/Paramfere/musicdownloader/main/budget-deploy.sh

# Make it executable
chmod +x budget-deploy.sh

# Run the deployment
./budget-deploy.sh
```

### Step 4: Configure API Keys (Optional but Recommended)
```bash
# Edit environment file
nano /var/www/audio-downloader/.env.local
```

Add your API keys (get them from the links below):
```env
NODE_ENV=production
PORT=3000

# Optional API keys for enhanced features:
ACOUSTID_API_KEY=your_key_here
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
GENIUS_ACCESS_TOKEN=your_token
LASTFM_API_KEY=your_api_key
DISCOGS_TOKEN=your_token
```

**Where to get API keys:**
- **AcoustID**: https://acoustid.org/api-key
- **Spotify**: https://developer.spotify.com/
- **Genius**: https://genius.com/api-clients
- **Last.fm**: https://www.last.fm/api
- **Discogs**: https://www.discogs.com/settings/developers

### Step 5: Start the Service
```bash
# Start the audio downloader
sudo systemctl start audio-downloader

# Check if it's running
sudo systemctl status audio-downloader

# Enable auto-start on boot
sudo systemctl enable audio-downloader
```

### Step 6: Access Your App
Open your browser and go to:
```
http://YOUR_VPS_IP:3000
```

🎉 **Your audio downloader is now live!**

## 💰 Cost Breakdown

| Item | Cost | Notes |
|------|------|-------|
| VPS (Kamatera) | $4/month | After 30-day free trial |
| Domain (optional) | $10/year | Or use free DuckDNS |
| SSL Certificate | FREE | Let's Encrypt |
| **Total** | **$4/month** | **$48/year** |

## 🔧 Useful Commands

### Check Service Status
```bash
sudo systemctl status audio-downloader
```

### View Logs
```bash
sudo journalctl -u audio-downloader -f
```

### Restart Service
```bash
sudo systemctl restart audio-downloader
```

### Update Application
```bash
cd /var/www/audio-downloader
sudo -u audioapp git pull origin main
sudo -u audioapp npm run build
sudo systemctl restart audio-downloader
```

### Monitor Resources
```bash
htop  # Check CPU/RAM usage
df -h # Check disk space
```

## 🌐 Adding a Domain Name (Optional)

### Option 1: Free Subdomain
1. Go to **duckdns.org**
2. Create free subdomain: `yourname.duckdns.org`
3. Point it to your VPS IP

### Option 2: Buy Domain
1. Buy domain from Namecheap/GoDaddy (~$10/year)
2. Add A record: `your-domain.com` → `YOUR_VPS_IP`

### Option 3: Use IP Address (Free)
Just access via `http://YOUR_VPS_IP:3000` - works perfectly!

## 🔒 Adding SSL (Optional)

If you have a domain name:
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

## 🚨 Troubleshooting

### Service Won't Start
```bash
# Check logs
sudo journalctl -u audio-downloader -n 50

# Check if port is in use
sudo netstat -tulpn | grep 3000

# Restart service
sudo systemctl restart audio-downloader
```

### Downloads Failing
```bash
# Update yt-dlp
sudo pip3 install --upgrade yt-dlp

# Check if ffmpeg is installed
ffmpeg -version

# Restart service
sudo systemctl restart audio-downloader
```

### Low Memory Issues
```bash
# Check memory usage
free -h

# Check if swap is enabled
swapon --show

# Create swap if needed (done automatically by script)
```

## 🎯 Performance Tips

- **1-2GB RAM**: Works for single downloads
- **2-4GB RAM**: Better for multiple users
- **Monitor usage**: Use `htop` to check resources
- **Upgrade if needed**: Start small, upgrade later

## 📱 Mobile Access

Your app works perfectly on mobile! Users can:
- Paste YouTube links
- Download tracks with full metadata
- Access from any device with internet

## 🎵 What You Get

✅ **Professional DJ metadata** (artist, album, genre, label, country)  
✅ **High-quality album art** embedded in AIFF files  
✅ **iTunes/Serato/Traktor compatible**  
✅ **Real-time download progress**  
✅ **Mobile-friendly interface**  
✅ **24/7 uptime**  
✅ **Multiple users support**  

## 💡 Money-Saving Tips

1. **Start with IP access** (no domain cost)
2. **Use free trial** (Kamatera 30 days free)
3. **Skip SSL initially** (add later)
4. **Monitor usage** (upgrade only if needed)
5. **Free subdomain** (DuckDNS instead of buying domain)

---

🎉 **Your $3-4/month professional audio downloader is ready to rock!** 🎵💰
