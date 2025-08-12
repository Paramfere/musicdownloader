import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

// Progress tracking
const progressStore = new Map<string, {
  status: string;
  percentage: number;
  message: string;
  operation: string;
  startTime: number;
  currentTime: number;
}>();

function updateProgress(trackId: string, status: string, percentage: number, message: string, operation: string) {
  const now = Date.now();
  const existing = progressStore.get(trackId);
  
  progressStore.set(trackId, {
    status,
    percentage,
    message,
    operation,
    startTime: existing?.startTime || now,
    currentTime: now
  });
}

export async function POST(request: NextRequest) {
  try {
    const { url, trackId, format = 'aiff' } = await request.json();
    
    if (!url || !trackId) {
      return NextResponse.json({ 
        success: false, 
        error: 'URL and trackId are required' 
      }, { status: 400 });
    }

    // Create session directory
    const sessionDir = path.join(os.tmpdir(), `vocal-removal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    fs.mkdirSync(sessionDir, { recursive: true });

    try {
      updateProgress(trackId, 'downloading', 10, 'Downloading audio from source...', 'Audio Download');
      
      // Download audio using yt-dlp
      const audioFilePath = await downloadAudio(url, sessionDir, trackId);
      
      updateProgress(trackId, 'processing', 30, 'Processing with Ultimate Vocal Remover...', 'Vocal Removal');
      
      // Process with UVR to remove vocals
      const instrumentalPath = await processWithUVR(audioFilePath, sessionDir, trackId);
      
      updateProgress(trackId, 'converting', 70, 'Converting to high-quality AIFF...', 'Format Conversion');
      
      // Convert to AIFF with metadata
      const aiffResult = await convertToAIFF(instrumentalPath, sessionDir, trackId);
      
      updateProgress(trackId, 'saving', 90, 'Saving instrumental version...', 'File Save');
      
      // Save to downloads directory
      const saveDirectory = path.join(os.homedir(), 'Downloads', 'AudioDownloader');
      fs.mkdirSync(saveDirectory, { recursive: true });
      
      const finalPath = path.join(saveDirectory, aiffResult.filename);
      fs.copyFileSync(aiffResult.filePath, finalPath);
      
      updateProgress(trackId, 'completed', 100, 'Vocal removal completed!', 'Complete');
      
      // Clean up session directory
      fs.rmSync(sessionDir, { recursive: true, force: true });
      
      return NextResponse.json({
        success: true,
        filename: aiffResult.filename,
        filePath: finalPath,
        saveDirectory,
        message: `Instrumental version saved to: ${finalPath}`,
        metadata: aiffResult.metadataVerified
      });

    } catch (error) {
      // Clean up on error
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
      throw error;
    }

  } catch (error) {
    console.error('Vocal removal error:', error);
    return NextResponse.json({
      success: false,
      error: `Vocal removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

async function downloadAudio(url: string, sessionDir: string, trackId: string): Promise<string> {
  try {
    // Use yt-dlp to download audio
    const outputTemplate = path.join(sessionDir, '%(title)s.%(ext)s');
    
    const ytdlpCmd = `yt-dlp -f "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio" --extract-audio --audio-format wav --audio-quality 0 --output "${outputTemplate}" --force-ipv4 --no-check-certificates --socket-timeout 30 --retries 3 --fragment-retries 3 --geo-bypass "${url}"`;
    
    console.log(`Executing yt-dlp command: ${ytdlpCmd}`);
    
    const { stdout, stderr } = await execAsync(ytdlpCmd, { timeout: 300000 }); // 5 minute timeout
    
    if (stderr) {
      console.warn('yt-dlp stderr:', stderr);
    }
    
    // Find the downloaded audio file
    const files = fs.readdirSync(sessionDir);
    const audioFile = files.find(file => 
      file.endsWith('.wav') || file.endsWith('.m4a') || file.endsWith('.webm')
    );
    
    if (!audioFile) {
      throw new Error('No audio file found after download');
    }
    
    const audioFilePath = path.join(sessionDir, audioFile);
    console.log(`Audio downloaded to: ${audioFilePath}`);
    
    return audioFilePath;
    
  } catch (error) {
    console.error('Error downloading audio:', error);
    throw new Error(`Failed to download audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function processWithUVR(audioFilePath: string, sessionDir: string, trackId: string): Promise<string> {
  try {
    updateProgress(trackId, 'processing', 40, 'Loading UVR models...', 'Model Loading');
    
    // Check if UVR is installed
    try {
      await execAsync('uvr --version');
    } catch {
      throw new Error('Ultimate Vocal Remover (UVR) is not installed. Please install UVR first.');
    }
    
    updateProgress(trackId, 'processing', 50, 'Separating vocals from instrumental...', 'Audio Separation');
    
    // Process with UVR to remove vocals
    const outputPath = path.join(sessionDir, 'instrumental.wav');
    
    // UVR command for vocal removal (adjust parameters based on your UVR version)
    const uvrCmd = `uvr --input "${audioFilePath}" --output "${outputPath}" --model "UVR-MDX-NET-Inst_HQ_3" --overlap 0.2 --mdx_batch_size 4 --mdx_denoise false`;
    
    console.log(`Executing UVR command: ${uvrCmd}`);
    
    const { stdout, stderr } = await execAsync(uvrCmd, { timeout: 600000 }); // 10 minute timeout for UVR
    
    if (stderr) {
      console.warn('UVR stderr:', stderr);
    }
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('UVR processing failed - no output file generated');
    }
    
    console.log(`Vocal removal completed: ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error('Error in UVR processing:', error);
    throw new Error(`Vocal removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function convertToAIFF(inputPath: string, sessionDir: string, trackId: string) {
  try {
    updateProgress(trackId, 'converting', 75, 'Converting to AIFF format...', 'AIFF Conversion');
    
    // Create output filename
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(sessionDir, `${baseName}_instrumental.aiff`);
    
    // Convert to AIFF using FFmpeg
    const ffmpegCmd = `ffmpeg -i "${inputPath}" -acodec pcm_s16be -ar 44100 -ac 2 -write_id3v2 1 -metadata title="Instrumental Version" -metadata comment="Vocal removal by UVR" -y "${outputPath}"`;
    
    console.log(`Executing FFmpeg command: ${ffmpegCmd}`);
    
    const { stdout, stderr } = await execAsync(ffmpegCmd, { timeout: 300000 }); // 5 minute timeout
    
    if (stderr) {
      console.warn('FFmpeg stderr:', stderr);
    }
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('AIFF conversion failed');
    }
    
    updateProgress(trackId, 'converting', 85, 'AIFF conversion completed', 'AIFF Conversion');
    
    // Verify metadata
    const verificationResult = await verifyMetadata(outputPath);
    
    return { 
      filePath: outputPath, 
      filename: `${baseName}_instrumental.aiff`,
      metadataVerified: verificationResult 
    };
    
  } catch (error) {
    console.error('Error converting to AIFF:', error);
    throw new Error(`AIFF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function verifyMetadata(filePath: string) {
  try {
    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_format "${filePath}"`);
    const metadata = JSON.parse(stdout);
    
    return {
      success: true,
      title: metadata.format.tags?.title || 'Unknown',
      artist: metadata.format.tags?.artist || 'Unknown',
      album: metadata.format.tags?.album || 'Unknown',
      comment: metadata.format.tags?.comment || '',
      allTags: Object.keys(metadata.format.tags || {})
    };
  } catch (error) {
    console.error('Error verifying metadata:', error);
    return { success: false, error: 'Metadata verification failed' };
  }
}
