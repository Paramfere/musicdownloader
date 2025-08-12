import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, copyFile } from 'fs/promises';
import path from 'path';
import os from 'os';

// Progress reporting helper
async function updateProgress(trackId: string, status: string, progress: number, message: string, currentOperation?: string) {
  try {
    await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId, status, progress, message, currentOperation }),
    });
  } catch (error) {
    console.warn('Failed to update progress:', error);
  }
}

// Enhanced metadata parsing for DJ software
function parseDescriptionForDJMetadata(description: string, fallbackTitle: string, fallbackArtist: string) {
  const desc = description.toLowerCase();
  const result: any = {};
  
  // Extract artist from description patterns
  const artistPatterns = [
    /artist\s*:\s*([^\n\r]+)/i,
    /by\s+([^\n\r]+?)\s*(?:label|catalog|released|\n)/i,
    /^([^\n\r–-]+?)\s*[–-]/i  // Artist at start before dash
  ];
  
  for (const pattern of artistPatterns) {
    const match = description.match(pattern);
    if (match && match[1].trim() && match[1].trim().length > 2) {
      result.artist = match[1].trim();
      break;
    }
  }
  
  // Extract title from description (track name) - be more specific
  // Don't override if we already have a good title from yt-dlp
  if (!fallbackTitle || fallbackTitle.toLowerCase().includes('untitled') || fallbackTitle.length < 3) {
    const titlePatterns = [
      /(?:track|title)\s*:\s*([^\n\r]+)/i,
      /^[^\n]*?[–-]\s*([^\n\r]+?)(?:\s*(?:artist|label|catalog|released|\n))/i
    ];
    
    for (const pattern of titlePatterns) {
      const match = description.match(pattern);
      if (match && match[1].trim()) {
        result.title = match[1].trim();
        break;
      }
    }
  }
  
  // Extract label
  const labelMatch = description.match(/label\s*:\s*([^\n\r]+)/i);
  if (labelMatch) {
    result.label = labelMatch[1].trim();
  }
  
  // Extract catalog number
  const catalogMatch = description.match(/catalog\s*:\s*([^\n\r]+)/i);
  if (catalogMatch) {
    result.catalog = catalogMatch[1].trim();
  }
  
  // Extract country
  const countryMatch = description.match(/country\s*:\s*([^\n\r]+)/i);
  if (countryMatch) {
    result.country = countryMatch[1].trim();
  }
  
  // Extract release year
  const yearMatch = description.match(/released\s*:?\s*(\d{4})/i);
  if (yearMatch) {
    result.releaseYear = yearMatch[1];
  }
  
  // Extract genre/style - look for common DJ genres
  const genrePatterns = [
    /genre\s*[\/\s]*style\s*:\s*([^\n\r]+)/i,  // "Genre / Style: Electronic, House"
    /style\s*:\s*([^\n\r]+)/i,  // "Style: House, Deep House"
    /genre\s*:\s*([^\n\r]+)/i,  // "Genre: Electronic"
    /(electronic|house|techno|trance|drum\s*[&\+]?\s*bass|dnb|dubstep|garage|breakbeat|ambient|downtempo|deep\s*house|tech\s*house|progressive|minimal|acid)[^\n\r]*/i
  ];
  
  for (const pattern of genrePatterns) {
    const match = description.match(pattern);
    if (match) {
      let genreText = match[1].trim();
      
      // Clean up genre text (remove extra characters)
      genreText = genreText.replace(/^[\s:,\/]+|[\s:,\/]+$/g, '');
      
      if (genreText.includes(',')) {
        const genres = genreText.split(',').map(g => g.trim());
        result.genre = genres[0];
        result.style = genres.slice(1).join(', ');
      } else {
        result.genre = genreText;
      }
      break;
    }
  }
  
  // Extract album/EP name from description
  const albumPatterns = [
    /([^\n\r]+?)\s*(?:ep|album|lp)\b/i,  // "Something EP" pattern
    /(?:album|ep|lp)\s*:\s*([^\n\r]+)/i,  // "Album: Something" pattern
    /^([^\n\r]+?)\s*[–-]/i  // First line before dash
  ];
  
  for (const pattern of albumPatterns) {
    const match = description.match(pattern);
    if (match && match[1].trim() && match[1].trim().length > 2) {
      result.album = match[1].trim();
      break;
    }
  }
  
  return result;
}

const execAsync = promisify(exec);

// Function to sanitize filenames for FFmpeg compatibility
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^\w\s\-_.]/g, '') // Remove special characters except alphanumeric, spaces, hyphens, underscores, dots
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .substring(0, 100); // Limit length to prevent path issues
}

export async function POST(request: NextRequest) {
  try {
    const { url, trackId, format = 'aiff', saveDirectory } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log(`Starting download for URL: ${url}, trackId: ${trackId}, format: ${format}, saveDirectory: ${saveDirectory || 'default'}`);

    // Initialize progress tracking
    await updateProgress(trackId, 'analyzing', 5, 'Analyzing URL and extracting metadata...', 'URL Analysis');

    // Create a unique session directory for this download
    const sessionDir = path.join(os.tmpdir(), `audio-downloader-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await mkdir(sessionDir, { recursive: true });

    console.log(`Created session directory: ${sessionDir}`);

    try {
      // Download the audio in best quality
      console.log('Downloading audio...');
      await updateProgress(trackId, 'downloading', 10, 'Starting audio download...', 'yt-dlp Download');
      const downloadResult = await downloadAudio(url, sessionDir, trackId);
      console.log(`Audio downloaded to: ${downloadResult.filePath}`);
      
      if (format === 'aiff') {
        // Convert to AIFF with metadata preservation
        console.log('Converting to AIFF...');
        await updateProgress(trackId, 'converting', 70, 'Converting to AIFF format with metadata...', 'AIFF Conversion');
        const aiffResult = await convertToAIFF(downloadResult.filePath, sessionDir, downloadResult.metadata);
        console.log(`AIFF conversion complete: ${aiffResult.filePath}`);
        
        // Determine save location - custom directory or default Downloads
        let finalSavePath: string;
        if (saveDirectory && saveDirectory.trim()) {
          // Use custom save directory
          let customPath = saveDirectory.trim();
          
          // Expand ~ to home directory for common paths
          if (customPath.startsWith('~/')) {
            customPath = path.join(os.homedir(), customPath.slice(2));
          }
          
          finalSavePath = path.resolve(customPath);
          console.log(`Using custom save directory: ${finalSavePath}`);
        } else {
          // Use default Downloads folder
          finalSavePath = path.join(os.homedir(), 'Downloads', 'AudioDownloader');
          console.log(`Using default save directory: ${finalSavePath}`);
        }
        
        // Create the save directory if it doesn't exist
        await mkdir(finalSavePath, { recursive: true });
        
        await updateProgress(trackId, 'tagging', 90, 'Saving file to destination...', 'File Copy');
        const finalPath = path.join(finalSavePath, aiffResult.filename);
        await copyFile(aiffResult.filePath, finalPath);
        console.log(`File saved to: ${finalPath}`);
        
        await updateProgress(trackId, 'completed', 100, 'Download completed successfully!', 'Complete');
        
        // Return success with file path
        return NextResponse.json({
          success: true,
          filename: aiffResult.filename,
          filePath: finalPath,
          saveDirectory: finalSavePath,
          message: `File saved to: ${finalPath}`,
          metadata: downloadResult.metadata,
          metadataVerified: aiffResult.metadataVerified
        });
      } else {
        // Save original file
        let finalSavePath: string;
        if (saveDirectory && saveDirectory.trim()) {
          // Use custom save directory
          let customPath = saveDirectory.trim();
          
          // Expand ~ to home directory for common paths
          if (customPath.startsWith('~/')) {
            customPath = path.join(os.homedir(), customPath.slice(2));
          }
          
          finalSavePath = path.resolve(customPath);
          console.log(`Using custom save directory: ${finalSavePath}`);
        } else {
          // Use default Downloads folder
          finalSavePath = path.join(os.homedir(), 'Downloads', 'AudioDownloader');
          console.log(`Using default save directory: ${finalSavePath}`);
        }
        
        // Create the save directory if it doesn't exist
        await mkdir(finalSavePath, { recursive: true });
        
        const finalPath = path.join(finalSavePath, downloadResult.filename);
        await copyFile(downloadResult.filePath, finalPath);
        console.log(`Original file saved to: ${finalPath}`);
        
        await updateProgress(trackId, 'completed', 100, 'Download completed successfully!', 'Complete');
        
        // Return success with file path
        return NextResponse.json({
          success: true,
          filename: downloadResult.filename,
          filePath: finalPath,
          saveDirectory: finalSavePath,
          message: `File saved to: ${finalPath}`,
          metadata: downloadResult.metadata
        });
      }
    } finally {
      // Clean up temporary files
      try {
        await execAsync(`rm -rf "${sessionDir}"`);
        console.log(`Cleaned up session directory: ${sessionDir}`);
      } catch (cleanupError) {
        console.error('Error cleaning up session directory:', cleanupError);
      }
    }
  } catch (error) {
    console.error('Error downloading audio:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { 
        success: false,
        error: `Failed to download audio: ${errorMessage}`,
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

async function downloadAudio(url: string, sessionDir: string, trackId?: string) {
  try {
    // Download with best audio quality and metadata, using sanitized filename template
    const outputTemplate = path.join(sessionDir, '%(title).100s.%(ext)s');
    
    // Enhanced yt-dlp command with timeout and network fixes
    const ytDlpCmd = [
      'yt-dlp',
      '--force-ipv4',  // Force IPv4 to avoid IPv6 hanging issues
      '--no-check-certificates',  // Skip certificate verification for problematic sites
      '--socket-timeout', '30',  // 30 second socket timeout
      '--retries', '3',  // Retry up to 3 times
      '--fragment-retries', '3',  // Retry fragments
      '--geo-bypass',  // Attempt to bypass geo-restrictions
      '-f', 'bestaudio',
      '-o', `"${outputTemplate}"`,
      '--write-thumbnail',
      '--embed-metadata',
      `"${url}"`
    ].join(' ');
    
    console.log(`Executing enhanced yt-dlp command: ${ytDlpCmd}`);
    
    if (trackId) {
      await updateProgress(trackId, 'downloading', 25, 'Downloading audio from source...', 'yt-dlp Download');
    }
    
    // Execute with 5 minute timeout
    await execAsync(ytDlpCmd, { 
      cwd: sessionDir,
      timeout: 300000  // 5 minute timeout
    });
    
    if (trackId) {
      await updateProgress(trackId, 'downloading', 45, 'Audio download complete, processing...', 'Download Complete');
    }
    
    console.log('yt-dlp download completed successfully');

    // Find the downloaded file more robustly
    console.log('Searching for downloaded audio files...');
    const { stdout: filesOutput } = await execAsync(`find "${sessionDir}" -type f \\( -name "*.m4a" -o -name "*.mp3" -o -name "*.webm" -o -name "*.opus" -o -name "*.flac" \\) -print`);
    
    const audioFiles = filesOutput.trim().split('\n').filter(file => file.length > 0);
    console.log('Found audio files:', audioFiles);

    if (audioFiles.length === 0) {
      // Fallback: list all files in directory
      const { stdout: allFiles } = await execAsync(`ls -la "${sessionDir}"`);
      console.log('All files in session directory:', allFiles);
      throw new Error('No audio file found after download');
    }

    const audioFile = audioFiles[0];
    console.log(`Selected audio file: ${audioFile}`);

    // Get metadata (normalized from yt-dlp JSON), optionally enriched
    const metadata = await extractMetadata(url, audioFile);
    console.log('Extracted metadata:', metadata);
    
    // Read the file into a buffer
    const { readFile } = await import('fs/promises');
    const fileBuffer = await readFile(audioFile);
    
    // Create a sanitized filename for the final output
    const originalFilename = path.basename(audioFile);
    const sanitizedFilename = sanitizeFilename(originalFilename);
    
    return {
      filePath: audioFile,
      fileBuffer,
      filename: sanitizedFilename,
      metadata,
    };
  } catch (error) {
    console.error('Error downloading audio:', error);
    
    // Provide specific error messages for common yt-dlp issues
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      
      if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        throw new Error('Download timed out after 5 minutes. Try a different URL or check your network connection.');
      }
      if (errorMsg.includes('unable to extract') || errorMsg.includes('video unavailable')) {
        throw new Error('Unable to access this video. It may be private, deleted, or geo-restricted.');
      }
      if (errorMsg.includes('no video formats') || errorMsg.includes('no suitable formats')) {
        throw new Error('No audio formats available. This may be a live stream or restricted content.');
      }
      if (errorMsg.includes('http error 429') || errorMsg.includes('too many requests')) {
        throw new Error('Rate limited by the source. Please wait a few minutes before trying again.');
      }
      if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        throw new Error('Network connection issue. Please check your internet connection and try again.');
      }
    }
    
    throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function convertToAIFF(inputPath: string, sessionDir: string, metadata: Record<string, string>) {
  try {
    // Create a clean, sanitized filename for the AIFF output
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const sanitizedBaseName = sanitizeFilename(baseName);
    const outputPath = path.join(sessionDir, `${sanitizedBaseName}.aiff`);
    
    // Clean and escape metadata values to prevent FFmpeg errors
    const cleanTitle = (metadata.title || 'Unknown Title').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanArtist = (metadata.artist || metadata.uploader || 'Unknown Artist').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanAlbum = (metadata.album || 'Unknown Album').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanDate = (metadata.date || '').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanAlbumArtist = (metadata.album_artist || '').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanGenre = (metadata.genre || '').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanLabel = (metadata.label || '').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanCountry = (metadata.country || '').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanCatalog = (metadata.catalog || '').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanStyle = (metadata.style || '').replace(/"/g, '\\"').replace(/'/g, "\\");
    
    // Download album art if available
    let albumArtPath: string | undefined;
    if (metadata.album_art_url) {
      try {
        albumArtPath = await downloadAlbumArt(metadata.album_art_url, sessionDir);
      } catch (e) {
        console.warn('Failed to download album art:', e);
      }
    }
    
    // Convert to AIFF with metadata preservation using proper FFmpeg options
    const ffmpegArgs: string[] = [
      'ffmpeg',
      '-i', `"${inputPath}"`,
    ];
    
    // Add album art as input if available
    if (albumArtPath) {
      ffmpegArgs.push('-i', `"${albumArtPath}"`);
    }
    
    ffmpegArgs.push(
      '-acodec', 'pcm_s16be', // Use big-endian for AIFF (more compatible)
      '-ar', '44100',
      '-ac', '2',
      '-write_id3v2', '1', // Enable ID3v2 metadata writing
      '-metadata', `title="${cleanTitle}"`,
      '-metadata', `artist="${cleanArtist}"`,
      '-metadata', `album="${cleanAlbum}"`,
      '-metadata', `date="${cleanDate}"`,
      '-metadata', `comment="Converted with Audio Downloader"`
    );
    
    // Add lyrics if available
    if (metadata.lyrics) {
      const cleanLyrics = metadata.lyrics.replace(/"/g, '\\"').replace(/'/g, "\\''").slice(0, 5000); // Limit length
      ffmpegArgs.push('-metadata', `lyrics="${cleanLyrics}"`);
    }

    if (cleanAlbumArtist) {
      ffmpegArgs.push('-metadata', `album_artist="${cleanAlbumArtist}"`);
    }
    if (cleanGenre) {
      ffmpegArgs.push('-metadata', `genre="${cleanGenre}"`);
    }
    if (cleanLabel) {
      ffmpegArgs.push('-metadata', `label="${cleanLabel}"`);
      ffmpegArgs.push('-metadata', `publisher="${cleanLabel}"`);
    }
    if (cleanCountry) {
      ffmpegArgs.push('-metadata', `country="${cleanCountry}"`);
    }
    if (cleanCatalog) {
      ffmpegArgs.push('-metadata', `catalog="${cleanCatalog}"`);
    }
    if (cleanStyle) {
      ffmpegArgs.push('-metadata', `style="${cleanStyle}"`);
    }
    
    // Map album art if available
    if (albumArtPath) {
      ffmpegArgs.push('-map', '0:a', '-map', '1:v', '-disposition:v:0', 'attached_pic');
    }

    ffmpegArgs.push('-y', `"${outputPath}"`);

    const ffmpegCmd = ffmpegArgs.join(' ');

    console.log(`Executing FFmpeg command: ${ffmpegCmd}`);
    
    // Execute FFmpeg with better error handling
    // Progress update would go here if trackId was passed to this function
    const { stdout, stderr } = await execAsync(ffmpegCmd);
    
    if (stderr) {
      console.log('FFmpeg stderr output:', stderr);
    }
    
    if (stdout) {
      console.log('FFmpeg stdout output:', stdout);
    }

    // Check if output file exists
    const { access } = await import('fs/promises');
    try {
      await access(outputPath);
      console.log(`AIFF file created successfully: ${outputPath}`);
    } catch (accessError) {
      throw new Error(`FFmpeg output file not found: ${outputPath}`);
    }

    // Verify metadata was embedded
    const metadataVerification = await verifyMetadata(outputPath);
    console.log('Metadata verification result:', metadataVerification);

    // Read the AIFF file into a buffer
    const { readFile } = await import('fs/promises');
    const fileBuffer = await readFile(outputPath);
    
    return {
      filePath: outputPath,
      fileBuffer,
      filename: path.basename(outputPath),
      metadataVerified: metadataVerification,
    };
  } catch (error) {
    console.error('Error converting to AIFF:', error);
    
    // Provide more detailed error information
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    throw new Error(`AIFF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function verifyMetadata(filePath: string) {
  try {
    // Use ffprobe to check if metadata was embedded
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );
    
    const fileInfo = JSON.parse(stdout);
    const format = fileInfo.format;
    
    if (format && format.tags) {
      const tags = format.tags;
      return {
        success: true,
        title: tags.title || 'Not found',
        artist: tags.artist || 'Not found',
        album: tags.album || 'Not found',
        date: tags.date || 'Not found',
        comment: tags.comment || 'Not found',
        allTags: Object.keys(tags),
      };
    } else {
      return {
        success: false,
        error: 'No metadata tags found',
      };
    }
  } catch (error) {
    console.error('Error verifying metadata:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function extractMetadata(url: string, audioFilePath?: string) {
  try {
    // Prefer full JSON for better field precedence
    const { stdout } = await execAsync(`yt-dlp -J "${url}"`);
    const info = JSON.parse(stdout);

    // If this is a playlist JSON, try to use the first entry
    const entry = Array.isArray(info?.entries) && info.entries.length > 0 ? info.entries[0] : info;

    // Title precedence: track -> title
    const rawTitle: string = (entry.track || entry.title || '').toString();

    // Artist precedence: artist -> artists[0].name -> album_artist -> channel -> uploader
    const rawArtist: string = (
      entry.artist ||
      (Array.isArray(entry.artists) && entry.artists.length > 0 ? (entry.artists[0]?.name || entry.artists[0]) : '') ||
      entry.album_artist ||
      entry.channel ||
      entry.uploader ||
      ''
    ).toString();

    // Album precedence: album -> playlist_title
    const rawAlbum: string = (entry.album || info.playlist_title || '').toString();

    // Date precedence: release_date (YYYYMMDD) -> release_year -> upload_date
    const yyyymmdd: string | undefined = (entry.release_date || entry.upload_date || '').toString() || undefined;
    const releaseYear: string | undefined = entry.release_year ? String(entry.release_year) : undefined;
    let cleanDate = '';
    if (yyyymmdd && /^\d{8}$/.test(yyyymmdd)) {
      cleanDate = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
    } else if (releaseYear && /^\d{4}$/.test(releaseYear)) {
      cleanDate = releaseYear;
    }

    const description: string = (entry.description || '').toString();
    const durationSeconds: string = entry.duration ? String(entry.duration) : '';
    const viewCount: string = entry.view_count ? String(entry.view_count) : '';
    const likeCount: string = entry.like_count ? String(entry.like_count) : '';
    const genre: string = (entry.genre || '').toString();

    // Clean values minimally (trim and collapse whitespace)
    const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
    
    // Enhanced metadata parsing for DJ software
    const enhancedMetadata = parseDescriptionForDJMetadata(description, rawTitle, rawArtist);

    let normalized: Record<string, string> = {
      title: collapse(enhancedMetadata.title || rawTitle) || 'Unknown Title',
      artist: collapse(enhancedMetadata.artist || rawArtist) || 'Unknown Artist',
      uploader: collapse(entry.uploader || ''),
      album: collapse(enhancedMetadata.album || rawAlbum) || 'Unknown Album',
      album_artist: collapse(enhancedMetadata.albumArtist || entry.album_artist || ''),
      date: enhancedMetadata.releaseYear || cleanDate,
      description: collapse(description).slice(0, 500),
      duration: durationSeconds,
      viewCount,
      likeCount,
      genre: collapse(enhancedMetadata.genre || genre) || '',
      label: enhancedMetadata.label || '', // Record label
      country: enhancedMetadata.country || '', // Country of release
      catalog: enhancedMetadata.catalog || '', // Catalog number
      style: enhancedMetadata.style || '', // Musical style/subgenre
      album_art_url: entry.thumbnail || '', // YouTube thumbnail as initial album art
    };

    // Optional enrichment via AcoustID/MusicBrainz using Chromaprint
    const acoustIdApiKey = process.env.ACOUSTID_API_KEY;
    if (acoustIdApiKey && audioFilePath) {
      try {
        // Progress update would go here if trackId was passed to this function
        const fpData = await getChromaprintFingerprint(audioFilePath);
        if (fpData) {
          const acoust = await lookupAcoustId(fpData.fingerprint, fpData.duration, acoustIdApiKey);
          const bestRec = getBestAcoustIdRecording(acoust);
          if (bestRec?.id) {
            const mb = await fetchMusicBrainzRecording(bestRec.id);
            if (mb) {
              normalized = mergeMusicBrainzMetadata(normalized, mb);
              
              // Fetch additional metadata from Discogs
              const discogsData = await fetchDiscogsMetadata(normalized.artist, normalized.title, normalized.album);
              if (discogsData) {
                if (discogsData.genre && !normalized.genre) {
                  normalized.genre = discogsData.genre;
                }
                if (discogsData.year && !normalized.date) {
                  normalized.date = discogsData.year;
                }
                // Add new fields for extended metadata
                normalized.label = discogsData.label || '';
                normalized.country = discogsData.country || '';
              }
              
              // Fetch album art from multiple sources
              let albumArt = await fetchAlbumArt(normalized);
              if (!albumArt) {
                albumArt = await fetchSpotifyAlbumArt(normalized.artist, normalized.title);
              }
              if (albumArt) {
                normalized.album_art_url = albumArt.url;
                normalized.album_art_type = albumArt.type;
              }
              
              // Fetch lyrics from multiple sources
              let lyrics = await fetchLyrics(normalized.artist, normalized.title);
              if (!lyrics) {
                lyrics = await fetchGeniusLyrics(normalized.artist, normalized.title);
              }
              if (lyrics) {
                normalized.lyrics = lyrics;
              }
            }
          }
        }
      } catch (enrichError) {
        console.error('Metadata enrichment failed (continuing with baseline):', enrichError);
      }
    }

    return normalized;
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return {
      title: 'Unknown Title',
      artist: 'Unknown Artist',
      uploader: 'Unknown Artist',
      album: 'Unknown Album',
      date: '',
      description: '',
      duration: '',
      viewCount: '',
      likeCount: '',
      album_artist: '',
      genre: '',
      label: '',
      country: '',
    };
  }
}

async function getChromaprintFingerprint(filePath: string): Promise<{ fingerprint: string; duration: number } | undefined> {
  try {
    const { stdout } = await execAsync(`fpcalc -json "${filePath}"`);
    const data = JSON.parse(stdout);
    if (data?.fingerprint && data?.duration) {
      return { fingerprint: String(data.fingerprint), duration: Number(data.duration) };
    }
    return undefined;
  } catch (error) {
    console.warn('fpcalc not available or failed; skipping fingerprint:', error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function lookupAcoustId(fingerprint: string, duration: number, client: string) {
  const endpoint = 'https://api.acoustid.org/v2/lookup';
  const body = new URLSearchParams();
  body.set('client', client);
  body.set('meta', 'recordings+releasegroups+releases+compress');
  body.set('fingerprint', fingerprint);
  body.set('duration', String(Math.round(duration)));
  body.set('format', 'json');

  const headers = {
    'User-Agent': 'AudioDownloader/0.1 (+https://localhost)',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
  } as const;

  // Small helper to perform the request
  const doRequest = async () => {
    return await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    });
  };

  let resp = await doRequest();
  // Simple retry on transient errors
  if (resp.status === 429 || resp.status === 503) {
    await new Promise(r => setTimeout(r, 1000));
    resp = await doRequest();
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`AcoustID HTTP ${resp.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return await resp.json();
}

function getBestAcoustIdRecording(acoustJson: any): { id?: string } | undefined {
  if (!acoustJson || !Array.isArray(acoustJson.results) || acoustJson.results.length === 0) return undefined;
  const sorted = acoustJson.results.slice().sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
  const top = sorted[0];
  const rec = Array.isArray(top.recordings) && top.recordings.length > 0 ? top.recordings[0] : undefined;
  return rec ? { id: rec.id } : undefined;
}

async function fetchMusicBrainzRecording(recordingId: string): Promise<any | undefined> {
  const url = `https://musicbrainz.org/ws/2/recording/${encodeURIComponent(recordingId)}?inc=artists+releases+release-groups+tags&fmt=json`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'AudioDownloader/1.0 (https://localhost)',
      'Accept': 'application/json',
    },
  });
  if (!resp.ok) {
    console.warn('MusicBrainz lookup failed', resp.status);
    return undefined;
  }
  return await resp.json();
}

function mergeMusicBrainzMetadata(current: Record<string, string>, mb: any): Record<string, string> {
  const merged = { ...current } as Record<string, string>;
  try {
    if (mb.title) merged.title = mb.title;

    if (Array.isArray(mb['artist-credit']) && mb['artist-credit'].length > 0) {
      const names = mb['artist-credit']
        .map((c: any) => c?.name || c?.artist?.name)
        .filter(Boolean);
      if (names.length > 0) merged.artist = names.join(', ');
    } else if (Array.isArray(mb.artists) && mb.artists.length > 0) {
      const names = mb.artists.map((a: any) => a?.name).filter(Boolean);
      if (names.length > 0) merged.artist = names.join(', ');
    }

    const releases = Array.isArray(mb.releases) ? mb.releases : [];
    const firstRelease = releases[0];
    const releaseGroup = mb['release-group'] || (Array.isArray(mb['release-groups']) ? mb['release-groups'][0] : undefined);
    const albumTitle = firstRelease?.title || releaseGroup?.title;
    if (albumTitle) merged.album = albumTitle;

    const date = firstRelease?.date || releaseGroup?.['first-release-date'];
    if (date) merged.date = date;

    const tags = Array.isArray(mb.tags) ? mb.tags : [];
    const genre = tags.length > 0 ? tags[0]?.name : undefined;
    if (genre) merged.genre = genre;

    // Store MusicBrainz IDs for album art lookup
    if (mb.id) merged.mbid = mb.id;
    if (releaseGroup?.id) merged.release_group_mbid = releaseGroup.id;
    if (firstRelease?.id) merged.release_mbid = firstRelease.id;
  } catch (e) {
    console.warn('Failed to merge MusicBrainz metadata:', e);
  }
  return merged;
}

async function fetchAlbumArt(metadata: Record<string, string>): Promise<{ url: string; type: string } | undefined> {
  try {
    // Try Cover Art Archive first (MusicBrainz)
    if (metadata.release_mbid) {
      const coverUrl = `https://coverartarchive.org/release/${metadata.release_mbid}/front`;
      const resp = await fetch(coverUrl, { method: 'HEAD' });
      if (resp.ok) {
        return { url: coverUrl, type: 'cover-art-archive' };
      }
    }
    
    if (metadata.release_group_mbid) {
      const coverUrl = `https://coverartarchive.org/release-group/${metadata.release_group_mbid}/front`;
      const resp = await fetch(coverUrl, { method: 'HEAD' });
      if (resp.ok) {
        return { url: coverUrl, type: 'cover-art-archive' };
      }
    }
    
    // Fallback to Last.fm API if available
    const lastfmKey = process.env.LASTFM_API_KEY;
    if (lastfmKey && metadata.artist && metadata.album) {
      const lastfmUrl = new URL('https://ws.audioscrobbler.com/2.0/');
      lastfmUrl.searchParams.set('method', 'album.getinfo');
      lastfmUrl.searchParams.set('api_key', lastfmKey);
      lastfmUrl.searchParams.set('artist', metadata.artist);
      lastfmUrl.searchParams.set('album', metadata.album);
      lastfmUrl.searchParams.set('format', 'json');
      
      const resp = await fetch(lastfmUrl.toString());
      if (resp.ok) {
        const data = await resp.json();
        const images = data?.album?.image;
        if (Array.isArray(images) && images.length > 0) {
          const largeImage = images.find((img: any) => img.size === 'extralarge') || images[images.length - 1];
          if (largeImage?.['#text']) {
            return { url: largeImage['#text'], type: 'lastfm' };
          }
        }
      }
    }
    
    return undefined;
  } catch (error) {
    console.warn('Failed to fetch album art:', error);
    return undefined;
  }
}

async function fetchLyrics(artist: string, title: string): Promise<string | undefined> {
  try {
    // Try Lyrics.ovh API (free)
    const lyricsUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const resp = await fetch(lyricsUrl, {
      headers: {
        'User-Agent': 'AudioDownloader/0.1 (+https://localhost)',
        'Accept': 'application/json',
      },
    });
    
    if (resp.ok) {
      const data = await resp.json();
      if (data?.lyrics && typeof data.lyrics === 'string') {
        return data.lyrics.trim();
      }
    }
    
    return undefined;
  } catch (error) {
    console.warn('Failed to fetch lyrics:', error);
    return undefined;
  }
}

async function downloadAlbumArt(url: string, sessionDir: string): Promise<string | undefined> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return undefined;
    
    const contentType = resp.headers.get('content-type') || '';
    let extension = 'jpg';
    if (contentType.includes('png')) extension = 'png';
    else if (contentType.includes('gif')) extension = 'gif';
    
    const albumArtPath = path.join(sessionDir, `album_art.${extension}`);
    const buffer = await resp.arrayBuffer();
    
    const { writeFile } = await import('fs/promises');
    await writeFile(albumArtPath, new Uint8Array(buffer));
    
    return albumArtPath;
  } catch (error) {
    console.warn('Error downloading album art:', error);
    return undefined;
  }
}

async function getSpotifyAccessToken(): Promise<string | undefined> {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return undefined;
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    
    if (resp.ok) {
      const data = await resp.json();
      return data.access_token;
    }
    
    return undefined;
  } catch (error) {
    console.warn('Failed to get Spotify access token:', error);
    return undefined;
  }
}

async function fetchSpotifyAlbumArt(artist: string, title: string): Promise<{ url: string; type: string } | undefined> {
  try {
    const accessToken = await getSpotifyAccessToken();
    if (!accessToken) return undefined;
    
    const query = encodeURIComponent(`track:${title} artist:${artist}`);
    const searchUrl = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`;
    
    const resp = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    if (resp.ok) {
      const data = await resp.json();
      const track = data?.tracks?.items?.[0];
      if (track?.album?.images?.length > 0) {
        // Get the highest quality image
        const image = track.album.images[0];
        return { url: image.url, type: 'spotify' };
      }
    }
    
    return undefined;
  } catch (error) {
    console.warn('Failed to fetch Spotify album art:', error);
    return undefined;
  }
}

async function fetchGeniusLyrics(artist: string, title: string): Promise<string | undefined> {
  try {
    const accessToken = process.env.GENIUS_ACCESS_TOKEN;
    if (!accessToken) return undefined;
    
    const query = encodeURIComponent(`${title} ${artist}`);
    const searchUrl = `https://api.genius.com/search?q=${query}`;
    
    const resp = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    if (resp.ok) {
      const data = await resp.json();
      const hit = data?.response?.hits?.[0];
      if (hit?.result?.id) {
        // Note: Genius API doesn't provide lyrics directly in the API
        // This would require web scraping which is against their ToS
        // Instead, we return a reference to the lyrics page
        const lyricsUrl = hit.result.url;
        return `Lyrics available at: ${lyricsUrl}`;
      }
    }
    
    return undefined;
  } catch (error) {
    console.warn('Failed to fetch Genius lyrics:', error);
    return undefined;
  }
}

async function fetchDiscogsMetadata(artist: string, title: string, album?: string): Promise<{ genre?: string; label?: string; country?: string; year?: string } | undefined> {
  try {
    const token = process.env.DISCOGS_TOKEN;
    if (!token) return undefined;
    
    // Search for release on Discogs
    const query = album ? `artist:"${artist}" release_title:"${album}"` : `artist:"${artist}" track:"${title}"`;
    const searchUrl = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=1`;
    
    const resp = await fetch(searchUrl, {
      headers: {
        'Authorization': `Discogs token=${token}`,
        'User-Agent': 'AudioDownloader/1.0',
        'Accept': 'application/json',
      },
    });
    
    if (resp.ok) {
      const data = await resp.json();
      const result = data?.results?.[0];
      if (result) {
        return {
          genre: result.genre?.join(', ') || result.style?.join(', '),
          label: result.label?.join(', '),
          country: result.country,
          year: result.year ? String(result.year) : undefined,
        };
      }
    }
    
    return undefined;
  } catch (error) {
    console.warn('Failed to fetch Discogs metadata:', error);
    return undefined;
  }
}
