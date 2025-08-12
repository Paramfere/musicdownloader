import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();
    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
    }
    // Limit to user's home directory to avoid arbitrary path access
    const homedir = process.env.HOME || process.env.USERPROFILE || '';
    if (!filePath.startsWith(homedir)) {
      return NextResponse.json({ error: 'Operation not permitted for this path' }, { status: 403 });
    }

    // macOS Finder reveal
    await execAsync(`open -R "${filePath}"`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}


