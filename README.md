# Audio Downloader - AIFF Converter

A modern web application for downloading and converting audio from various sources (SoundCloud, YouTube, etc.) to high-quality AIFF format with full metadata preservation.

## Features

- 🎵 **Multiple Sources**: Support for SoundCloud, YouTube, and 1,800+ other sites via yt-dlp
- 🎧 **AIFF Format**: Lossless audio quality (1,411 kbps) with full metadata preservation
- 📋 **Playlist Support**: Download entire playlists with one click
- 🎨 **Modern UI**: Beautiful, responsive interface built with Next.js and Tailwind CSS
- 🚀 **Vercel Ready**: Optimized for deployment on Vercel

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Audio Processing**: yt-dlp, ffmpeg
- **Deployment**: Vercel

## Prerequisites

Before deploying, ensure you have:

1. **yt-dlp** installed on your system
2. **ffmpeg** installed on your system
3. **Node.js** 18+ installed

### Installing Dependencies

#### macOS (Homebrew)
```bash
brew install yt-dlp ffmpeg
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install yt-dlp ffmpeg
```

#### Windows
```bash
# Install via Chocolatey
choco install yt-dlp ffmpeg

# Or download from official websites
# https://github.com/yt-dlp/yt-dlp
# https://ffmpeg.org/download.html
```

## Local Development

1. **Clone and install dependencies**
   ```bash
   git clone <your-repo-url>
   cd audio-downloader
   npm install
   ```

2. **Start development server**
   ```bash
   npm run dev
   ```

3. **Open your browser**
   Navigate to `http://localhost:3000`

## Deployment to Vercel

### Option 1: Deploy via Vercel Dashboard

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js settings

3. **Deploy**
   - Click "Deploy"
   - Wait for build to complete

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel --prod
   ```

## Important Notes for Vercel Deployment

### ⚠️ **Critical Limitation**
**This app requires yt-dlp and ffmpeg to be installed on the server. Vercel's serverless functions do not support system-level installations.**

### 🔧 **Alternative Deployment Options**

1. **Railway** - Supports custom Docker containers
2. **DigitalOcean App Platform** - Supports custom buildpacks
3. **Heroku** - Supports custom buildpacks
4. **Self-hosted VPS** - Full control over system dependencies

### 🐳 **Docker Deployment (Recommended)**

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    yt-dlp \
    ffmpeg \
    python3 \
    py3-pip

# Install yt-dlp via pip for latest version
RUN pip3 install --upgrade yt-dlp

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
```

## Usage

1. **Paste URL**: Enter a SoundCloud, YouTube, or other supported URL
2. **Analyze**: Click "Analyze" to extract playlist/track information
3. **Download**: Download individual tracks or entire playlists
4. **Convert**: Audio is automatically converted to AIFF format with metadata

## Supported Sites

- SoundCloud
- YouTube
- Vimeo
- TikTok
- Instagram
- Facebook
- Twitter/X
- Twitch
- Reddit
- And 1,800+ more via yt-dlp extractors

## Audio Quality

- **Input**: Best available quality from source (typically 160-320 kbps)
- **Output**: AIFF format at 1,411 kbps (CD quality, lossless)
- **Metadata**: Full preservation of title, artist, album, date, etc.

## API Endpoints

- `POST /api/analyze` - Analyze URL and extract playlist/track info
- `POST /api/download` - Download and convert audio to AIFF

## Environment Variables

No environment variables required for basic functionality.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the [yt-dlp documentation](https://github.com/yt-dlp/yt-dlp)
2. Check the [ffmpeg documentation](https://ffmpeg.org/documentation.html)
3. Open an issue in this repository

## Disclaimer

This tool is for personal use only. Please respect copyright laws and terms of service of the platforms you download from.
