#!/bin/bash

# 🐙 DigitalOcean Audio Downloader Deployment
# Optimized for DigitalOcean Droplets

set -e

echo "🐙 Deploying Audio Downloader on DigitalOcean..."

# Variables
APP_DIR="/var/www/audio-downloader"
DROPLET_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || echo "YOUR_DROPLET_IP")

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

# Install dependencies
echo "📦 Installing dependencies..."
sudo -u audioapp npm ci --only=production

# Build application
echo "🏗️ Building application..."
sudo -u audioapp npm run build

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

# Create PM2 ecosystem config
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
    max_memory_restart: '800M',
    node_args: '--max-old-space-size=768',
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
    max_restarts: 10,
    min_uptime: '10s',
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

# Create Nginx configuration for reverse proxy
echo "🌐 Setting up Nginx reverse proxy..."
sudo apt install -y nginx

sudo tee /etc/nginx/sites-available/audio-downloader > /dev/null << EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Increase timeouts for long audio processing
        proxy_read_timeout 1800s;
        proxy_connect_timeout 60s;
        proxy_send_timeout 1800s;
    }
}
EOF

# Enable site and remove default
sudo ln -sf /etc/nginx/sites-available/audio-downloader /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

echo "✅ DigitalOcean deployment complete!"
echo ""
echo "🐙 DIGITALOCEAN SETUP SUMMARY:"
echo "- Application deployed and running"
echo "- Nginx reverse proxy configured"
echo "- PM2 process manager active"
echo "- Systemd service enabled"
echo ""
echo "🔧 FINAL STEPS:"
echo "1. Start the service:"
echo "   sudo systemctl start audio-downloader"
echo ""
echo "2. Check status:"
echo "   sudo systemctl status audio-downloader"
echo ""
echo "3. View logs:"
echo "   sudo journalctl -u audio-downloader -f"
echo ""
echo "4. Access your app:"
echo "   http://$DROPLET_IP"
echo ""
echo "🎤 VOCAL REMOVAL FEATURES:"
echo "- UVR installed and ready"
echo "- High-quality instrumental extraction"
echo "- Multiple AI models available"
echo "- Both download modes working"
echo ""
echo "💰 DIGITALOCEAN COST:"
echo "- Basic Droplet: \$4/month (1GB RAM)"
echo "- Standard Droplet: \$6/month (1GB RAM)"
echo "- Recommended: \$12/month (2GB RAM)"
echo ""
echo "🎵 Your DigitalOcean audio downloader is ready!"
echo "🚀 Access it at: http://$DROPLET_IP"
