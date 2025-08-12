#!/bin/bash

# 🐙 DigitalOcean Audio Downloader VPS Setup
# Optimized for DigitalOcean Droplets ($4-12/month)

set -e

echo "🐙 Setting up Audio Downloader on DigitalOcean..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git unzip htop

# Install Node.js 20 (LTS)
echo "📦 Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python3 and dependencies
echo "🐍 Installing Python dependencies..."
sudo apt install -y python3 python3-pip python3-venv python3-dev build-essential

# Install yt-dlp
echo "🎵 Installing yt-dlp..."
sudo pip3 install yt-dlp

# Install FFmpeg
echo "🎬 Installing FFmpeg..."
sudo apt install -y ffmpeg

# Install chromaprint
echo "🔍 Installing chromaprint..."
sudo apt install -y libchromaprint-tools

# Install PM2 globally
echo "⚙️ Installing PM2..."
sudo npm install -g pm2

# Install Ultimate Vocal Remover (UVR)
echo "🎤 Installing Ultimate Vocal Remover (UVR)..."
UVR_DIR="/opt/uvr"
sudo mkdir -p $UVR_DIR
sudo chown $USER:$USER $UVR_DIR

cd $UVR_DIR
git clone https://github.com/Anjok07/ultimatevocalremovergui.git .
git checkout v5.6.0

# Create Python virtual environment for UVR
echo "🐍 Setting up UVR Python environment..."
python3 -m venv venv
source venv/bin/activate

# Install UVR requirements
echo "📦 Installing UVR requirements..."
pip install --upgrade pip
pip install -r requirements.txt

# Install PyTorch (CPU version for DigitalOcean)
echo "🔥 Installing PyTorch (CPU version)..."
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Create UVR CLI wrapper
echo "🔧 Creating UVR CLI wrapper..."
sudo tee /usr/local/bin/uvr > /dev/null << EOF
#!/bin/bash
cd $UVR_DIR
source venv/bin/activate
python inference.py "\$@"
EOF

sudo chmod +x /usr/local/bin/uvr

# Configure firewall (DigitalOcean uses UFW)
echo "🔒 Setting up firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
sudo ufw --force enable

# Create app user
echo "👤 Creating app user..."
sudo useradd -m -s /bin/bash audioapp

# Set up app directory
sudo mkdir -p /var/www/audio-downloader
sudo chown audioapp:audioapp /var/www/audio-downloader

# Create swap file (important for DigitalOcean 1GB droplets)
echo "💾 Creating swap file..."
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Optimize system for audio processing
echo "⚡ Optimizing system for audio processing..."
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
echo 'vm.vfs_cache_pressure=50' | sudo tee -a /etc/sysctl.conf

# Clean up
echo "🧹 Cleaning up..."
sudo apt autoremove -y
sudo apt autoclean

echo "✅ DigitalOcean setup complete!"
echo ""
echo "🐙 DIGITALOCEAN OPTIMIZATIONS:"
echo "- Swap file created for memory management"
echo "- System optimized for audio processing"
echo "- Firewall configured for security"
echo "- UVR ready for vocal removal"
echo ""
echo "📋 System specs:"
echo "RAM: $(free -h | awk 'NR==2{printf "%.0f", $2/1024}')GB"
echo "Swap: $(free -h | awk 'NR==3{printf "%.0f", $2/1024}')GB"
echo "CPU: $(nproc) cores"
echo "Storage: $(df -h / | awk 'NR==2{print $2}')"
echo ""
echo "🎤 VOCAL REMOVAL READY:"
echo "- UVR installed and configured"
echo "- High-quality AI models available"
echo "- CLI interface ready"
echo ""
echo "🔧 Next: Run digitalocean-deploy.sh"
