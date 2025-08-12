#!/bin/bash

# 🎵 Audio Downloader VPS Setup Script
# Run this on your fresh Ubuntu 22.04 VPS

set -e

echo "🚀 Setting up Audio Downloader VPS..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git unzip software-properties-common

# Install Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python and pip (for yt-dlp)
sudo apt install -y python3 python3-pip python-is-python3

# Install yt-dlp (latest version)
sudo pip3 install yt-dlp

# Install FFmpeg (full version with all codecs)
sudo apt install -y ffmpeg

# Install chromaprint for audio fingerprinting
sudo apt install -y libchromaprint-tools

# Install PM2 for process management
sudo npm install -g pm2

# Set up firewall
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
sudo ufw --force enable

# Create app user
sudo useradd -m -s /bin/bash audioapp
sudo usermod -aG sudo audioapp

# Set up app directory
sudo mkdir -p /var/www/audio-downloader
sudo chown audioapp:audioapp /var/www/audio-downloader

# Install Nginx (for reverse proxy)
sudo apt install -y nginx

echo "✅ VPS setup complete!"
echo "🔧 Next steps:"
echo "1. Clone your repository to /var/www/audio-downloader"
echo "2. Install npm dependencies"
echo "3. Set up environment variables"
echo "4. Configure Nginx"
echo "5. Start with PM2"

# Display versions
echo "📋 Installed versions:"
echo "Node.js: $(node --version)"
echo "NPM: $(npm --version)"
echo "yt-dlp: $(yt-dlp --version)"
echo "FFmpeg: $(ffmpeg -version | head -1)"
echo "Chromaprint: $(fpcalc -version 2>&1 | head -1)"
