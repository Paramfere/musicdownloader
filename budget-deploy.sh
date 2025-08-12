#!/bin/bash

# 🎵 BUDGET Audio Downloader Deployment - Optimized for minimal VPS
# For $3-4/month VPS with 1-2GB RAM

set -e

echo "💰 Deploying Audio Downloader on BUDGET VPS..."

# Variables
APP_DIR="/var/www/audio-downloader"
DOMAIN="your-domain.com"  # Replace with your domain or use IP

# Clone repository
if [ ! -d "$APP_DIR/.git" ]; then
    echo "📥 Cloning repository..."
    sudo -u audioapp git clone https://github.com/Paramfere/musicdownloader.git $APP_DIR
else
    echo "🔄 Updating repository..."
    cd $APP_DIR
    sudo -u audioapp git pull origin main
fi

cd $APP_DIR

# Install ONLY production dependencies (save space)
echo "📦 Installing minimal dependencies..."
sudo -u audioapp npm ci --only=production

# Build with memory optimization for small VPS
echo "🏗️ Building with memory limits..."
sudo -u audioapp NODE_OPTIONS="--max-old-space-size=512" npm run build

# Create minimal environment file
echo "⚙️ Setting up environment..."
sudo -u audioapp tee .env.local > /dev/null << EOF
NODE_ENV=production
PORT=3000
# Add your API keys here:
# ACOUSTID_API_KEY=your_key
# SPOTIFY_CLIENT_ID=your_id  
# SPOTIFY_CLIENT_SECRET=your_secret
# GENIUS_ACCESS_TOKEN=your_token
# LASTFM_API_KEY=your_key
# DISCOGS_TOKEN=your_token
EOF

# Create optimized PM2 config for budget VPS
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'audio-downloader',
    script: 'npm',
    args: 'start',
    cwd: '$APP_DIR',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '400M',  // Lower for budget VPS
    node_args: '--max-old-space-size=512',  // Memory optimization
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // Auto-restart on crashes
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
}
EOF

# Create logs directory
sudo -u audioapp mkdir -p logs

# Simple reverse proxy without Nginx (save memory)
echo "🌐 Setting up simple reverse proxy..."

# Create systemd service for direct port access
sudo tee /etc/systemd/system/audio-downloader.service > /dev/null << EOF
[Unit]
Description=Audio Downloader
After=network.target

[Service]
Type=forking
User=audioapp
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/pm2 start ecosystem.config.js --no-daemon
ExecReload=/usr/bin/pm2 reload ecosystem.config.js
ExecStop=/usr/bin/pm2 kill
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable audio-downloader

echo "✅ Budget deployment complete!"
echo ""
echo "💰 BUDGET SETUP SUMMARY:"
echo "- Optimized for minimal resources"
echo "- No Nginx (direct Node.js access)"
echo "- Memory-limited build process"
echo "- Auto-restart on crashes"
echo ""
echo "🔧 FINAL STEPS:"
echo "1. Edit your API keys:"
echo "   sudo nano $APP_DIR/.env.local"
echo ""
echo "2. Start the service:"
echo "   sudo systemctl start audio-downloader"
echo ""
echo "3. Check status:"
echo "   sudo systemctl status audio-downloader"
echo ""
echo "4. Access your app:"
echo "   http://YOUR_VPS_IP:3000"
echo ""
echo "💡 MONEY-SAVING TIPS:"
echo "- Use IP instead of domain (free)"
echo "- Skip SSL initially (add later)"
echo "- Monitor resource usage: htop"
echo ""
echo "🎵 Your BUDGET audio downloader is ready!"
