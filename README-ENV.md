# Environment Configuration

## Required API Keys

### AcoustID (Recommended)
For accurate audio fingerprinting and metadata enrichment:
1. Visit: https://acoustid.org/api-key
2. Register and get your API key
3. Add to `.env.local`: `ACOUSTID_API_KEY=your_key_here`

## Optional API Keys (For Enhanced Features)

### Spotify Web API
For high-quality album art and detailed track metadata:
1. Visit: https://developer.spotify.com/dashboard/applications
2. Create a new app and get your Client ID and Secret
3. Add to `.env.local`:
   ```
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   ```

### Genius API
For official lyrics and song information:
1. Visit: https://genius.com/api-clients
2. Create a new API client and get your access token
3. Add to `.env.local`: `GENIUS_ACCESS_TOKEN=your_token`

### Last.fm API
For additional album art fallback:
1. Visit: https://www.last.fm/api/account/create
2. Get your API key
3. Add to `.env.local`: `LASTFM_API_KEY=your_key`

### Discogs API
For extended metadata and genre information:
1. Visit: https://www.discogs.com/settings/developers
2. Generate a personal access token
3. Add to `.env.local`: `DISCOGS_TOKEN=your_token`

## Setup Instructions

1. Create `.env.local` in the `audio-downloader` directory
2. Add your API keys (at minimum, add the AcoustID key)
3. Restart the development server: `npm run dev`

## Feature Coverage by API

| Feature | AcoustID | Spotify | Genius | Last.fm | Cover Art Archive |
|---------|----------|---------|--------|---------|-------------------|
| Audio Fingerprinting | ✅ | ❌ | ❌ | ❌ | ❌ |
| Artist/Album Metadata | ✅ | ✅ | ✅ | ✅ | ❌ |
| Album Art | ❌ | ✅ | ❌ | ✅ | ✅ |
| Lyrics | ❌ | ❌ | ✅ | ❌ | ❌ |
| Genre Information | ✅ | ✅ | ❌ | ✅ | ❌ |
| Release Dates | ✅ | ✅ | ✅ | ✅ | ❌ |

**Note**: The app works without any API keys using basic yt-dlp metadata, but adding keys significantly improves accuracy and richness of metadata.
