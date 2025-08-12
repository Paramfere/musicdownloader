import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { extractMetadata } from '../download/route';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // First, check if it's a playlist and get basic info
    const playlistInfo = await getPlaylistInfo(url);
    
    if (playlistInfo.isPlaylist) {
      // Get all tracks in the playlist with metadata
      const tracks = await getPlaylistTracks(url, true);
      
      // Generate unique IDs and log for debugging
      const processedTracks = tracks.map((track, index) => {
        const uniqueId = track.id ? `${track.id}-${index}` : `playlist-track-${index}`;
        console.log(`Track ${index}: ID="${track.id}" -> Unique ID="${uniqueId}"`);
        return {
          id: uniqueId,
          title: track.title || `Track ${index + 1}`,
          uploader: track.uploader || 'Unknown Artist',
          artist: track.artist || track.uploader || 'Unknown Artist',
          album: track.album || '',
          duration: track.duration,
          thumbnail: track.thumbnail,
          status: 'pending' as const,
        };
      });
      
      return NextResponse.json({
        title: playlistInfo.title || 'Playlist',
        trackCount: processedTracks.length,
        tracks: processedTracks,
      });
    } else {
      // Single track
      const trackInfo = await getTrackInfo(url);
      
      // Enrich with metadata if possible
      const metadata = await extractMetadata(url);
      
      const uniqueId = trackInfo.id ? `single-${trackInfo.id}` : 'single-track-0';
      console.log(`Single track: ID="${trackInfo.id}" -> Unique ID="${uniqueId}"`);
      
      return NextResponse.json({
        title: trackInfo.title || 'Single Track',
        trackCount: 1,
        tracks: [{
          id: uniqueId,
          title: trackInfo.title || 'Unknown Track',
          uploader: trackInfo.uploader || 'Unknown Artist',
          artist: metadata?.artist || trackInfo.uploader || 'Unknown Artist',
          album: metadata?.album || '',
          duration: trackInfo.duration,
          thumbnail: trackInfo.thumbnail,
          status: 'pending' as const,
        }],
      });
    }
  } catch (error) {
    console.error('Error analyzing URL:', error);
    return NextResponse.json(
      { error: 'Failed to analyze URL' },
      { status: 500 }
    );
  }
}

async function getPlaylistInfo(url: string) {
  try {
    const { stdout } = await execAsync(`yt-dlp --flat-playlist --print "%(playlist_title)s" "${url}"`);
    const lines = stdout.trim().split('\n');
    const title = lines[0] || 'Playlist';
    
    return {
      isPlaylist: true,
      title,
    };
  } catch (error) {
    console.error('Error getting playlist info:', error);
    return { isPlaylist: false, title: 'Unknown' };
  }
}

async function getPlaylistTracks(url: string, withMetadata = false) {
  try {
    const { stdout } = await execAsync(`yt-dlp --flat-playlist --print "%(id)s|%(title)s|%(uploader)s|%(duration)s|%(thumbnail)s" "${url}"`);
    
    return stdout.trim().split('\n').map(line => {
      const [id, title, uploader, duration, thumbnail] = line.split('|');
      const track = {
        id: id || '',
        title: title || 'Unknown Title',
        uploader: uploader || 'Unknown Artist',
        duration: duration ? formatDuration(parseInt(duration)) : undefined,
        thumbnail: thumbnail || undefined,
        artist: '',
        album: '',
      };
      
      // If metadata enrichment is requested, do it asynchronously
      if (withMetadata && id) {
        // We'll enrich this track later in a batch
      }
      
      return track;
    });
  } catch (error) {
    console.error('Error getting playlist tracks:', error);
    return [];
  }
}

async function getTrackInfo(url: string) {
  try {
    const { stdout } = await execAsync(`yt-dlp --print "%(id)s|%(title)s|%(uploader)s|%(duration)s|%(thumbnail)s" "${url}"`);
    
    const [id, title, uploader, duration, thumbnail] = stdout.trim().split('|');
    return {
      id: id || '',
      title: title || 'Unknown Title',
      uploader: uploader || 'Unknown Artist',
      duration: duration ? formatDuration(parseInt(duration)) : undefined,
      thumbnail: thumbnail || undefined,
    };
  } catch (error) {
    console.error('Error getting track info:', error);
    return {
      id: '',
      title: 'Unknown Track',
      uploader: 'Unknown Artist',
      duration: undefined,
      thumbnail: undefined,
    };
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
