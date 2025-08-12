import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, copyFile } from 'fs/promises';
import path from 'path';
import os from 'os';

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

    // Create a unique session directory for this download
    const sessionDir = path.join(os.tmpdir(), `audio-downloader-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await mkdir(sessionDir, { recursive: true });

    console.log(`Created session directory: ${sessionDir}`);

    try {
      // Download the audio in best quality
      console.log('Downloading audio...');
      const downloadResult = await downloadAudio(url, sessionDir);
      console.log(`Audio downloaded to: ${downloadResult.filePath}`);
      
      if (format === 'aiff') {
        // Convert to AIFF with metadata preservation
        console.log('Converting to AIFF...');
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
        
        const finalPath = path.join(finalSavePath, aiffResult.filename);
        await copyFile(aiffResult.filePath, finalPath);
        console.log(`File saved to: ${finalPath}`);
        
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

async function downloadAudio(url: string, sessionDir: string) {
  try {
    // Download with best audio quality and metadata, using sanitized filename template
    const outputTemplate = path.join(sessionDir, '%(title).100s.%(ext)s');
    
    console.log(`Executing yt-dlp command: yt-dlp -f 'bestaudio' -o "${outputTemplate}" --write-thumbnail --embed-metadata "${url}"`);
    
    await execAsync(
      `yt-dlp -f 'bestaudio' -o "${outputTemplate}" --write-thumbnail --embed-metadata "${url}"`,
      { cwd: sessionDir }
    );

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

    // Get metadata
    const metadata = await extractMetadata(url);
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
    const cleanArtist = (metadata.uploader || 'Unknown Artist').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanAlbum = (metadata.album || 'Unknown Album').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const cleanDate = (metadata.date || '').replace(/"/g, '\\"').replace(/'/g, "\\'");
    
    // Convert to AIFF with metadata preservation using proper FFmpeg options
    const ffmpegCmd = [
      'ffmpeg',
      '-i', `"${inputPath}"`,
      '-acodec', 'pcm_s16be', // Use big-endian for AIFF (more compatible)
      '-ar', '44100',
      '-ac', '2',
      '-write_id3v2', '1', // Enable ID3v2 metadata writing
      '-metadata', `title="${cleanTitle}"`,
      '-metadata', `artist="${cleanArtist}"`,
      '-metadata', `album="${cleanAlbum}"`,
      '-metadata', `date="${cleanDate}"`,
      '-metadata', `comment="Converted with Audio Downloader"`,
      '-y', // Overwrite output file
      `"${outputPath}"`
    ].join(' ');

    console.log(`Executing FFmpeg command: ${ffmpegCmd}`);
    
    // Execute FFmpeg with better error handling
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

async function extractMetadata(url: string) {
  try {
    // Get comprehensive metadata using yt-dlp
    const { stdout } = await execAsync(
      `yt-dlp --print "%(title)s|%(uploader)s|%(album)s|%(date)s|%(description)s|%(duration)s|%(view_count)s|%(like_count)s" "${url}"`
    );
    
    const [title, uploader, album, date, description, duration, viewCount, likeCount] = stdout.trim().split('|');
    
    // Clean and validate metadata
    const cleanTitle = title && title !== 'NA' ? title.trim() : 'Unknown Title';
    const cleanUploader = uploader && uploader !== 'NA' ? uploader.trim() : 'Unknown Artist';
    const cleanAlbum = album && album !== 'NA' ? album.trim() : 'Unknown Album';
    const cleanDate = date && date !== 'NA' ? date.trim() : '';
    const cleanDescription = description && description !== 'NA' ? description.trim().substring(0, 200) : '';
    
    return {
      title: cleanTitle,
      uploader: cleanUploader,
      album: cleanAlbum,
      date: cleanDate,
      description: cleanDescription,
      duration: duration && duration !== 'NA' ? duration.trim() : '',
      viewCount: viewCount && viewCount !== 'NA' ? viewCount.trim() : '',
      likeCount: likeCount && likeCount !== 'NA' ? likeCount.trim() : '',
    };
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return {
      title: 'Unknown Title',
      uploader: 'Unknown Artist',
      album: 'Unknown Album',
      date: '',
      description: '',
      duration: '',
      viewCount: '',
      likeCount: '',
    };
  }
}
