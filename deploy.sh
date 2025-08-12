#!/bin/bash

# 🎵 Audio Downloader Deployment Script
# Run this AFTER vps-setup.sh to deploy your app

set -e

echo "🚀 Deploying Audio Downloader..."

# Variables
APP_DIR="/var/www/audio-downloader"
DOMAIN="your-domain.com"  # Replace with your domain

# Clone repository (if not already done)
if [ ! -d "$APP_DIR/.git" ]; then
    echo "📥 Cloning repository..."
    sudo -u audioapp git clone https://github.com/yourusername/audio-downloader.git $APP_DIR
else
    echo "🔄 Updating repository..."
    cd $APP_DIR
    sudo -u audioapp git pull origin main
fi

cd $APP_DIR

# Install dependencies
echo "📦 Installing dependencies..."
sudo -u audioapp npm install

# Build the application
echo "🏗️ Building application..."
sudo -u audioapp npm run build

# Set up environment variables
echo "⚙️ Setting up environment..."
sudo -u audioapp cp .env.local.example .env.local 2>/dev/null || true

echo "📝 Please edit /var/www/audio-downloader/.env.local with your API keys:"
echo "- ACOUSTID_API_KEY=your_key"
echo "- SPOTIFY_CLIENT_ID=your_id"
echo "- SPOTIFY_CLIENT_SECRET=your_secret"
echo "- GENIUS_ACCESS_TOKEN=your_token"
echo "- LASTFM_API_KEY=your_key"
echo "- DISCOGS_TOKEN=your_token"

# Set up PM2 ecosystem file
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
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
EOF

# Create logs directory
sudo -u audioapp mkdir -p logs

# Set up Nginx configuration
echo "🌐 Configuring Nginx..."
sudo cp nginx.conf /etc/nginx/sites-available/audio-downloader
sudo sed -i "s/your-domain.com/$DOMAIN/g" /etc/nginx/sites-available/audio-downloader
sudo ln -sf /etc/nginx/sites-available/audio-downloader /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Install Certbot for SSL
echo "🔒 Setting up SSL..."
sudo apt install -y certbot python3-certbot-nginx

echo "✅ Deployment complete!"
echo ""
echo "🔧 Final steps:"
echo "1. Edit .env.local with your API keys:"
echo "   sudo nano $APP_DIR/.env.local"
echo ""
echo "2. Get SSL certificate:"
echo "   sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "3. Start the application:"
echo "   cd $APP_DIR && sudo -u audioapp pm2 start ecosystem.config.js"
echo "   sudo -u audioapp pm2 save"
echo "   sudo -u audioapp pm2 startup"
echo ""
echo "4. Restart services:"
echo "   sudo systemctl restart nginx"
echo ""
echo "🎵 Your audio downloader will be available at: https://$DOMAIN"
