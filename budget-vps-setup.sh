#!/bin/bash

# 🎵 BUDGET Audio Downloader VPS Setup - Optimized for $3-4/month VPS
# For minimal specs: 1-2GB RAM, 1-2 vCPU, 20-40GB storage

set -e

echo "💰 Setting up BUDGET Audio Downloader VPS..."

# Update system (minimal packages only)
sudo apt update && sudo apt upgrade -y

# Install only essential tools
sudo apt install -y curl wget git unzip

# Install Node.js 20 (using binary distribution for speed)
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python3 and pip (minimal)
sudo apt install -y python3 python3-pip --no-install-recommends

# Install yt-dlp (latest version)
echo "🎵 Installing yt-dlp..."
sudo pip3 install yt-dlp

# Install FFmpeg (essential for audio processing)
echo "🎬 Installing FFmpeg..."
sudo apt install -y ffmpeg --no-install-recommends

# Install chromaprint (for audio fingerprinting)
echo "🔍 Installing chromaprint..."
sudo apt install -y libchromaprint-tools --no-install-recommends

# Install PM2 globally (process manager)
echo "⚙️ Installing PM2..."
sudo npm install -g pm2

# Basic firewall setup
echo "🔒 Setting up firewall..."
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# Create app user (no sudo privileges for security)
echo "👤 Creating app user..."
sudo useradd -m -s /bin/bash audioapp

# Set up minimal app directory
sudo mkdir -p /var/www/audio-downloader
sudo chown audioapp:audioapp /var/www/audio-downloader

# Clean up unnecessary packages to save space
echo "🧹 Cleaning up..."
sudo apt autoremove -y
sudo apt autoclean

# Create swap file for low-RAM systems (only if < 2GB RAM)
TOTAL_RAM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
if [ $TOTAL_RAM -lt 2000 ]; then
    echo "💾 Creating swap file for low RAM system..."
    sudo fallocate -l 1G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "✅ Budget VPS setup complete!"
echo ""
echo "💡 OPTIMIZATION TIPS:"
echo "- Your VPS has limited resources"
echo "- Downloads will be slower but still work"
echo "- Consider upgrading if you need faster processing"
echo ""
echo "📋 Installed versions:"
echo "Node.js: $(node --version)"
echo "yt-dlp: $(yt-dlp --version)"
echo "FFmpeg: $(ffmpeg -version | head -1)"
echo "RAM: ${TOTAL_RAM}MB"
echo ""
echo "🔧 Next: Run budget-deploy.sh"
