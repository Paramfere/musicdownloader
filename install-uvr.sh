#!/bin/bash

# 🎤 Ultimate Vocal Remover (UVR) Installation Script for VPS
# This script installs UVR for vocal removal functionality

set -e

echo "🎤 Installing Ultimate Vocal Remover (UVR)..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Python dependencies
echo "📦 Installing Python dependencies..."
sudo apt install -y python3 python3-pip python3-venv python3-dev

# Install system dependencies for UVR
echo "🔧 Installing system dependencies..."
sudo apt install -y git wget curl build-essential libffi-dev libssl-dev

# Install FFmpeg (if not already installed)
if ! command -v ffmpeg &> /dev/null; then
    echo "🎬 Installing FFmpeg..."
    sudo apt install -y ffmpeg
else
    echo "✅ FFmpeg already installed"
fi

# Create UVR directory
UVR_DIR="/opt/uvr"
sudo mkdir -p $UVR_DIR
sudo chown $USER:$USER $UVR_DIR

# Clone UVR repository
echo "📥 Cloning UVR repository..."
cd $UVR_DIR
git clone https://github.com/Anjok07/ultimatevocalremovergui.git .
git checkout v5.6.0  # Use stable version

# Create Python virtual environment
echo "🐍 Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python requirements
echo "📦 Installing Python requirements..."
pip install --upgrade pip
pip install -r requirements.txt

# Install additional dependencies for CLI usage
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Create UVR CLI wrapper
echo "🔧 Creating UVR CLI wrapper..."
cat > /usr/local/bin/uvr << EOF
#!/bin/bash
cd $UVR_DIR
source venv/bin/activate
python inference.py "\$@"
EOF

chmod +x /usr/local/bin/uvr

# Download UVR models (optional - will download on first use)
echo "📥 UVR models will be downloaded automatically on first use"

# Create systemd service for UVR (optional)
echo "⚙️ Creating UVR service..."
sudo tee /etc/systemd/system/uvr.service > /dev/null << EOF
[Unit]
Description=Ultimate Vocal Remover
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$UVR_DIR
ExecStart=$UVR_DIR/venv/bin/python inference.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Test UVR installation
echo "🧪 Testing UVR installation..."
if command -v uvr &> /dev/null; then
    echo "✅ UVR CLI wrapper created successfully"
    echo "🎤 UVR installation completed!"
    echo ""
    echo "📋 Usage:"
    echo "  uvr --help                    # Show help"
    echo "  uvr --input file.wav --output instrumental.wav --model UVR-MDX-NET-Inst_HQ_3"
    echo ""
    echo "🔧 Available models:"
    echo "  - UVR-MDX-NET-Inst_HQ_3     # High quality instrumental extraction"
    echo "  - UVR-MDX-NET-Voc_FT        # Vocal extraction"
    echo "  - UVR-MDX-NET-Inst          # Standard instrumental extraction"
    echo ""
    echo "💡 Note: Models will be downloaded automatically on first use"
    echo "💡 Processing time depends on audio length and model complexity"
else
    echo "❌ UVR installation failed"
    exit 1
fi

echo ""
echo "🎵 UVR is now ready for vocal removal in your audio downloader!"
echo "🚀 You can now use the 'Remove Vocals' feature in your app"
