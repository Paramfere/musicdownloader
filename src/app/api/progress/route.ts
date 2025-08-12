import { NextRequest, NextResponse } from 'next/server';

// In-memory progress store (in production, you'd use Redis or a database)
const progressStore = new Map<string, {
  status: 'analyzing' | 'downloading' | 'converting' | 'enriching' | 'tagging' | 'completed' | 'error';
  progress: number; // 0-100
  message: string;
  startTime: number;
  currentOperation?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  error?: string;
}>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get('trackId');

  if (!trackId) {
    return NextResponse.json({ error: 'trackId is required' }, { status: 400 });
  }

  const progress = progressStore.get(trackId);
  if (!progress) {
    return NextResponse.json({ error: 'Progress not found' }, { status: 404 });
  }

  const elapsedTime = Date.now() - progress.startTime;
  const estimatedTotal = progress.progress > 0 ? (elapsedTime / progress.progress) * 100 : 0;
  const estimatedRemaining = Math.max(0, estimatedTotal - elapsedTime);

  return NextResponse.json({
    ...progress,
    elapsedTime,
    estimatedRemaining: progress.status === 'completed' ? 0 : estimatedRemaining,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { trackId, status, progress, message, currentOperation, bytesDownloaded, totalBytes, error } = await request.json();

    if (!trackId) {
      return NextResponse.json({ error: 'trackId is required' }, { status: 400 });
    }

    const existing = progressStore.get(trackId);
    const startTime = existing?.startTime || Date.now();

    progressStore.set(trackId, {
      status,
      progress: Math.min(100, Math.max(0, progress || 0)),
      message: message || '',
      startTime,
      currentOperation,
      bytesDownloaded,
      totalBytes,
      error,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating progress:', error);
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get('trackId');

  if (!trackId) {
    return NextResponse.json({ error: 'trackId is required' }, { status: 400 });
  }

  progressStore.delete(trackId);
  return NextResponse.json({ success: true });
}
