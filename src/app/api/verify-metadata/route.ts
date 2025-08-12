import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    // Security check: Ensure the path is within the user's home directory
    const absolutePath = path.resolve(filePath);
    const homeDir = os.homedir();

    if (!absolutePath.startsWith(homeDir)) {
      return NextResponse.json({ error: 'Access denied: Path outside home directory' }, { status: 403 });
    }

    // Check if file exists and is an AIFF file
    if (!absolutePath.toLowerCase().endsWith('.aiff') && !absolutePath.toLowerCase().endsWith('.aif')) {
      return NextResponse.json({ error: 'File must be an AIFF file' }, { status: 400 });
    }

    console.log(`Verifying metadata for: ${absolutePath}`);

    // Use ffprobe to extract metadata
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${absolutePath}"`
    );

    const data = JSON.parse(stdout);
    const format = data.format || {};
    const tags = format.tags || {};

    // Extract key metadata fields
    const verification = {
      success: true,
      title: tags.title || tags.TITLE || '',
      artist: tags.artist || tags.ARTIST || '',
      album: tags.album || tags.ALBUM || '',
      date: tags.date || tags.DATE || tags.year || tags.YEAR || '',
      genre: tags.genre || tags.GENRE || '',
      label: tags.label || tags.LABEL || '',
      country: tags.country || tags.COUNTRY || '',
      comment: tags.comment || tags.COMMENT || '',
      albumArtist: tags.album_artist || tags['ALBUM_ARTIST'] || '',
      duration: format.duration || '',
      bitRate: format.bit_rate || '',
      fileSize: format.size || '',
      allTags: Object.keys(tags),
    };

    return NextResponse.json({ 
      success: true, 
      verification,
      filePath: absolutePath,
      fileName: path.basename(absolutePath)
    });
  } catch (error) {
    console.error('Error verifying metadata:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('No such file')) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      if (error.message.includes('Invalid data found')) {
        return NextResponse.json({ error: 'Invalid AIFF file or corrupted metadata' }, { status: 400 });
      }
    }

    return NextResponse.json(
      { success: false, error: `Failed to verify metadata: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
