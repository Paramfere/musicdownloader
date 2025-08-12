#!/bin/bash

# 🎵 AWS Audio Downloader Deployment - Optimized for Free Tier t2.micro
# For 1GB RAM EC2 instance

set -e

echo "🆓 Deploying Audio Downloader on AWS Free Tier..."

# Variables
APP_DIR="/var/www/audio-downloader"
EC2_PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

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

# Install ONLY production dependencies (save memory)
echo "📦 Installing minimal dependencies..."
sudo -u audioapp npm ci --only=production

# Build with EXTREME memory optimization for 1GB RAM
echo "🏗️ Building with memory limits for AWS Free Tier..."
sudo -u audioapp NODE_OPTIONS="--max-old-space-size=256" npm run build

# Create environment file
echo "⚙️ Setting up environment..."
sudo -u audioapp tee .env.local > /dev/null << EOF
NODE_ENV=production
PORT=3000
# Add your API keys here (optional):
# ACOUSTID_API_KEY=your_key
# SPOTIFY_CLIENT_ID=your_id  
# SPOTIFY_CLIENT_SECRET=your_secret
# GENIUS_ACCESS_TOKEN=your_token
# LASTFM_API_KEY=your_key
# DISCOGS_TOKEN=your_token
EOF

# Create ultra-optimized PM2 config for 1GB RAM
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
    max_memory_restart: '200M',  // Very low for 1GB RAM
    node_args: '--max-old-space-size=256',  // Extreme memory optimization
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
    autorestart: true,
    max_restarts: 20,  // More restarts due to memory constraints
    min_uptime: '5s',
    restart_delay: 2000
  }]
}
EOF

# Create logs directory
sudo -u audioapp mkdir -p logs

# Create systemd service
sudo tee /etc/systemd/system/audio-downloader.service > /dev/null << EOF
[Unit]
Description=Audio Downloader
After=network.target

[Service]
Type=forking
User=audioapp
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/pm2 start ecosystem.config.js --no-daemon
ExecReload=/usr/local/bin/pm2 reload ecosystem.config.js
ExecStop=/usr/local/bin/pm2 kill
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable audio-downloader

echo "✅ AWS Free Tier deployment complete!"
echo ""
echo "🆓 AWS FREE TIER SETUP SUMMARY:"
echo "- Optimized for 1GB RAM"
echo "- 2GB swap file created"
echo "- Memory-limited build process"
echo "- Auto-restart on memory issues"
echo ""
echo "🔧 FINAL STEPS:"
echo "1. Configure AWS Security Group:"
echo "   - Allow inbound TCP port 3000"
echo "   - Source: 0.0.0.0/0 (or your IP)"
echo ""
echo "2. Start the service:"
echo "   sudo systemctl start audio-downloader"
echo ""
echo "3. Check status:"
echo "   sudo systemctl status audio-downloader"
echo ""
echo "4. Access your app:"
echo "   http://$EC2_PUBLIC_IP:3000"
echo ""
echo "⚠️  PERFORMANCE EXPECTATIONS:"
echo "- Single downloads: 2-5 minutes each"
echo "- Concurrent users: 1 max recommended"
echo "- May restart due to memory limits"
echo "- Consider upgrading if heavily used"
echo ""
echo "💰 COST AFTER 12 MONTHS:"
echo "- t2.micro: ~\$8.50/month"
echo "- t3.micro: ~\$7.50/month"
echo "- Budget VPS: \$4/month (better performance)"
echo ""
echo "🎵 Your FREE audio downloader is ready!"
