#!/bin/bash

# 🎵 AWS Free Tier Audio Downloader Setup - Optimized for t2.micro (1GB RAM)
# This setup is specifically for AWS EC2 t2.micro instance with 1GB RAM

set -e

echo "🆓 Setting up Audio Downloader on AWS Free Tier..."

# Update system
sudo yum update -y

# Install Node.js 20 (Amazon Linux 2023)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20

# Install Python3 and pip
sudo yum install -y python3 python3-pip

# Install yt-dlp
pip3 install --user yt-dlp

# Install FFmpeg (from EPEL for Amazon Linux)
sudo yum install -y epel-release
sudo yum install -y ffmpeg

# Install chromaprint
sudo yum install -y libchromaprint-devel
# For CentOS/RHEL: try alternative
sudo yum install -y chromaprint-tools || echo "Chromaprint not available in yum, will install manually"

# Install PM2 globally
npm install -g pm2

# Create swap file for low RAM (CRITICAL for 1GB RAM)
echo "💾 Creating 2GB swap file for low RAM system..."
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Set up app user
sudo useradd -m -s /bin/bash audioapp

# Create app directory
sudo mkdir -p /var/www/audio-downloader
sudo chown audioapp:audioapp /var/www/audio-downloader

# Basic firewall setup (AWS Security Groups handle most of this)
sudo systemctl enable firewalld
sudo systemctl start firewalld
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

echo "✅ AWS Free Tier setup complete!"
echo ""
echo "⚠️  IMPORTANT NOTES:"
echo "- 1GB RAM is minimal for audio processing"
echo "- Added 2GB swap to prevent crashes"
echo "- Downloads will be slower than dedicated VPS"
echo "- Free tier expires after 12 months"
echo ""
echo "📋 System specs:"
echo "RAM: $(free -h | awk 'NR==2{printf "%.0f", $2/1024}')MB"
echo "Swap: $(free -h | awk 'NR==3{printf "%.0f", $2/1024}')MB"
echo "CPU: $(nproc) cores"
echo ""
echo "🔧 Next: Run aws-deploy.sh"
