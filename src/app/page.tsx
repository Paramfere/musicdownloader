'use client';

import { useState, useCallback, useEffect } from 'react';
import { Download, Music, Play, Loader2, AlertCircle, CheckCircle, X, Clock, Zap } from 'lucide-react';
import axios from 'axios';

interface Track {
  id: string;
  title: string;
  uploader: string;
  artist?: string;
  album?: string;
  duration?: string;
  thumbnail?: string;
  status: 'pending' | 'analyzing' | 'downloading' | 'converting' | 'enriching' | 'tagging' | 'completed' | 'error';
  progress?: number;
  error?: string;
  albumArt?: string;
  lyrics?: string;
  currentOperation?: string;
  elapsedTime?: number;
  estimatedRemaining?: number;
  detailedMessage?: string;
}

interface Playlist {
  title: string;
  trackCount: number;
  tracks: Track[];
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [error, setError] = useState('');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionStats, setCompletionStats] = useState({ successful: 0, total: 0, failed: 0 });
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [saveDirectory, setSaveDirectory] = useState('');
  const [progressPolling, setProgressPolling] = useState<Record<string, NodeJS.Timeout>>({});
  const [toasts, setToasts] = useState<Array<{ 
    id: number; 
    type: 'success' | 'error'; 
    title: string; 
    message?: string; 
    filePath?: string;
    metadataVerification?: {
      success: boolean;
      title?: string;
      artist?: string;
      album?: string;
      date?: string;
      genre?: string;
      label?: string;
      country?: string;
      allTags?: string[];
    };
  }>>([]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setError('');
    setPlaylist(null);

    try {
      const response = await axios.post('/api/analyze', { url: url.trim() });
      setPlaylist(response.data);
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze URL');
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  // Progress polling function
  const pollProgress = useCallback(async (trackId: string) => {
    try {
      const response = await axios.get(`/api/progress?trackId=${trackId}`);
      const progressData = response.data;
      
      console.log(`Progress update for ${trackId}:`, progressData);
      
      // Update playlist state (this is what the UI displays)
      setPlaylist(prev => prev ? {
        ...prev,
        tracks: prev.tracks.map(track => 
          track.id === trackId ? {
            ...track,
            status: progressData.status,
            progress: progressData.progress,
            currentOperation: progressData.currentOperation,
            elapsedTime: progressData.elapsedTime,
            estimatedRemaining: progressData.estimatedRemaining,
            detailedMessage: progressData.message,
            error: progressData.error,
          } : track
        )
      } : null);
      
      // Stop polling if completed or error
      if (progressData.status === 'completed' || progressData.status === 'error') {
        setProgressPolling(prev => {
          const interval = prev[trackId];
          if (interval) {
            clearInterval(interval);
          }
          const updated = { ...prev };
          delete updated[trackId];
          return updated;
        });
      }
    } catch (error) {
      // Handle different types of errors
      if (error?.response?.status === 404 || error?.response?.data?.error?.includes('Progress not found')) {
        // Progress not found is normal initially - keep polling
        console.log(`Progress not yet available for ${trackId}, continuing to poll...`);
      } else {
        console.warn('Progress polling error:', error);
      }
    }
  }, []);
  
  // Start progress polling for a track
  const startProgressPolling = useCallback((trackId: string) => {
    const interval = setInterval(() => pollProgress(trackId), 1000);
    setProgressPolling(prev => ({ ...prev, [trackId]: interval }));
  }, [pollProgress]);
  
  // Cleanup progress polling on unmount
  useEffect(() => {
    return () => {
      Object.values(progressPolling).forEach(interval => clearInterval(interval));
    };
  }, [progressPolling]);

  const handleDownload = useCallback(async (trackId: string) => {
    try {
      // Start progress tracking
      setPlaylist(prev => prev ? {
        ...prev,
        tracks: prev.tracks.map(t => 
          t.id === trackId ? { 
            ...t, 
            status: 'analyzing' as const, 
            progress: 0,
            currentOperation: 'Initializing...',
            detailedMessage: 'Starting download process'
          } : t
        )
      } : null);

      // Start polling for progress updates (with small delay to let backend initialize)
      setTimeout(() => startProgressPolling(trackId), 200);

      const response = await axios.post('/api/download', {
        url: url.trim(),
        trackId,
        format: 'aiff',
        saveDirectory: saveDirectory.trim() || undefined
      });

      if (response.data.success) {
        // Progress polling will handle the completed state, but make sure it's set
        setPlaylist(prev => prev ? {
          ...prev,
          tracks: prev.tracks.map(t => 
            t.id === trackId ? { ...t, status: 'completed' as const, progress: 100 } : t
          )
        } : null);

        // Show non-blocking toast with metadata info
        const id = Date.now();
        const metadata = response.data.metadata || {};
        const verification = response.data.metadataVerified || {};
        const message = `${response.data.filePath}${metadata.album ? ` • Album: ${metadata.album}` : ''}${metadata.lyrics ? ' • Lyrics included' : ''}`;
        setToasts(prev => [
          ...prev,
          { 
            id, 
            type: 'success', 
            title: 'Download complete', 
            message, 
            filePath: response.data.filePath,
            metadataVerification: verification
          }
        ]);
        // Auto dismiss after 8s for more content
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000);
      } else {
        throw new Error(response.data.error || 'Download failed');
      }
    } catch (err) {
      console.error('Download error:', err);
      
      // Stop progress polling on error
      const interval = progressPolling[trackId];
      if (interval) {
        clearInterval(interval);
        setProgressPolling(prev => {
          const updated = { ...prev };
          delete updated[trackId];
          return updated;
        });
      }
      
      // Update track status to error
      setPlaylist(prev => prev ? {
        ...prev,
        tracks: prev.tracks.map(t => 
          t.id === trackId ? { ...t, status: 'error' as const, error: err instanceof Error ? err.message : 'Unknown error' } : t
        )
      } : null);

      const id = Date.now();
      setToasts(prev => [
        ...prev,
        { id, type: 'error', title: 'Download failed', message: err instanceof Error ? err.message : 'Unknown error' }
      ]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
    }
  }, [url, saveDirectory]);

  const handleDownloadAll = useCallback(async () => {
    if (!playlist || playlist.tracks.length === 0) return;
    
    setIsBatchDownloading(true);
    const downloadPromises = playlist.tracks.map(async (track, index) => {
      try {
        // Add delay between requests to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, index * 1000));
        
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 300000) // 5 minutes
        );
        
        // Create the download request with proper timeout handling
        const downloadPromise = axios.post('/api/download', {
          url: `https://www.youtube.com/watch?v=${track.id.split('-')[0]}`, // Extract video ID and create individual track URL
          trackId: track.id,
          format: 'aiff',
          saveDirectory: saveDirectory.trim() || undefined
        }, {
          timeout: 300000, // 5 minutes timeout
          headers: {
            'Content-Type': 'application/json'
          }
        });

        // Race between download and timeout
        const response = await Promise.race([downloadPromise, timeoutPromise]) as { data: { success: boolean; error?: string } };
        
        if (response.data.success) {
          // Update track status to completed
          setPlaylist(prev => prev ? {
            ...prev,
            tracks: prev.tracks.map(t => 
              t.id === track.id ? { ...t, status: 'completed' as const } : t
            )
          } : null);
          return { success: true, trackId: track.id };
        } else {
          throw new Error(response.data.error || 'Download failed');
        }
      } catch (error) {
        console.error(`Download failed for track ${track.id}:`, error);
        
        // Update track status to failed
        setPlaylist(prev => prev ? {
          ...prev,
          tracks: prev.tracks.map(t => 
            t.id === track.id ? { ...t, status: 'error' as const, error: error instanceof Error ? error.message : 'Unknown error' } : t
          )
        } : null);
        
        return { success: false, trackId: track.id, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    try {
      const results = await Promise.allSettled(downloadPromises);
      
      // Count successful and failed downloads
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
      
      setCompletionStats({ successful, failed, total: playlist.tracks.length });
      setShowCompletionModal(true);
    } catch (error) {
      console.error('Batch download error:', error);
      alert('Batch download failed. Please try again.');
    } finally {
      setIsBatchDownloading(false);
    }
  }, [playlist, saveDirectory]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">Audio Downloader</h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Download and convert audio from SoundCloud, YouTube, and more to high-quality AIFF format with full metadata preservation.
          </p>
        </div>

        {/* Main Form */}
        <div className="max-w-4xl mx-auto mb-8">
          <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-white mb-2">
                  Audio URL
                </label>
                <input
                  type="url"
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://youtube.com/playlist?list=..."
                  className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="saveDirectory" className="block text-sm font-medium text-white mb-2">
                  Save Directory
                </label>
                <div className="space-y-2">
                  <select
                    id="saveDirectory"
                    value={saveDirectory}
                    onChange={(e) => setSaveDirectory(e.target.value)}
                    className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">📁 Downloads/AudioDownloader (Default)</option>
                    <option value="~/Music">🎵 Music Folder (~/Music)</option>
                    <option value="~/Desktop">🖥️ Desktop (~/Desktop)</option>
                    <option value="~/Documents">📄 Documents (~/Documents)</option>
                    <option value="~/Downloads">⬇️ Downloads (~/Downloads)</option>
                    <option value="custom">🔧 Custom Path...</option>
                  </select>
                  
                  {saveDirectory === 'custom' && (
                    <input
                      type="text"
                      placeholder="/Users/username/Music or /Volumes/Drive/Music"
                      value={saveDirectory === 'custom' ? '' : saveDirectory}
                      onChange={(e) => setSaveDirectory(e.target.value)}
                      className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  )}
                  
                  <p className="text-xs text-gray-300">
                    💡 <strong>Quick Tips:</strong> Use ~ for home directory, drag folders from Finder, or type custom paths
                  </p>
                </div>
              </div>
              
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
              >
                {isLoading ? 'Analyzing...' : 'Analyze URL'}
              </button>
            </div>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-300 text-center">{error}</p>
            </div>
          </div>
        )}

        {/* Playlist Display */}
        {playlist && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">{playlist.title}</h2>
                <button
                  onClick={handleDownloadAll}
                  disabled={isBatchDownloading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  {isBatchDownloading ? 'Downloading...' : `Download All (${playlist.tracks.length})`}
                </button>
              </div>
              
              <div className="space-y-3">
                {playlist.tracks.map((track, index) => (
                  <div key={`${track.id}-${index}`} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex-1">
                      <h3 className="text-white font-medium">{track.title}</h3>
                      <p className="text-gray-300 text-sm">{track.artist || track.uploader}</p>
                      {track.album && <p className="text-gray-300 text-xs italic">{track.album}</p>}
                      <p className="text-gray-400 text-xs">{track.duration}</p>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      {track.status === 'completed' && (
                        <CheckCircle className="text-green-400" size={16} />
                      )}
                      {(track.status === 'analyzing' || track.status === 'downloading' || track.status === 'converting' || track.status === 'enriching' || track.status === 'tagging') && (
                        <div className="flex items-center space-x-2 text-blue-400">
                          <Loader2 className="animate-spin" size={16} />
                          <div className="text-xs">
                            <div className="font-medium">{track.currentOperation || track.status}</div>
                            {track.detailedMessage && (
                              <div className="text-gray-400 text-xs">{track.detailedMessage}</div>
                            )}
                            {track.progress !== undefined && (
                              <div className="w-32 bg-gray-700 rounded-full h-1.5 mt-1">
                                <div 
                                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" 
                                  style={{ width: `${Math.max(0, Math.min(100, track.progress || 0))}%` }}
                                ></div>
                              </div>
                            )}
                            {track.elapsedTime && (
                              <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                                <Clock size={10} />
                                <span>{Math.round(track.elapsedTime / 1000)}s</span>
                                {track.estimatedRemaining && track.estimatedRemaining > 0 && (
                                  <>
                                    <span>•</span>
                                    <Zap size={10} />
                                    <span>~{Math.round(track.estimatedRemaining / 1000)}s left</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {track.status === 'error' && (
                        <AlertCircle className="text-red-400" size={16} title={track.error} />
                      )}
                      
                      <button
                        onClick={() => handleDownload(track.id)}
                        disabled={['analyzing', 'downloading', 'converting', 'enriching', 'tagging'].includes(track.status)}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm py-2 px-3 rounded transition-colors duration-200"
                      >
                        {track.status === 'completed' ? 'Downloaded' : 
                         ['analyzing', 'downloading', 'converting', 'enriching', 'tagging'].includes(track.status) ? 
                         `${track.currentOperation || track.status}${track.progress ? ` (${Math.round(track.progress)}%)` : '...'}` : 
                         track.status === 'error' ? 'Retry' : 'Download'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Feature Cards */}
        <div className="max-w-4xl mx-auto mt-16">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎵</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Multiple Sources</h3>
              <p className="text-gray-300">Support for SoundCloud, YouTube, and 1,800+ other sites</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎧</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">AIFF Format</h3>
              <p className="text-gray-300">Lossless audio quality with full metadata preservation</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📋</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Playlist Support</h3>
              <p className="text-gray-300">Download entire playlists with one click</p>
            </div>
          </div>
        </div>

        {/* Completion Modal */}
        {showCompletionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Download Complete!</h3>
              <div className="space-y-2 mb-4">
                <p><strong>Total Tracks:</strong> {completionStats.total}</p>
                <p className="text-green-600"><strong>Successful:</strong> {completionStats.successful}</p>
                <p className="text-red-600"><strong>Failed:</strong> {completionStats.failed}</p>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Files have been saved to your selected folder.
              </p>
              <button
                onClick={() => setShowCompletionModal(false)}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Toasts */}
        <div className="fixed right-4 top-4 z-50 space-y-2">
          {toasts.map(t => (
            <div key={t.id} className={`rounded shadow-lg p-4 w-80 ${t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
              <div className="flex items-start justify-between">
                <div className="pr-2">
                  <div className="font-semibold">{t.title}</div>
                  {t.message && <div className="text-sm break-all opacity-90 mt-1">{t.message}</div>}
                </div>
                <button aria-label="Dismiss" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="opacity-80 hover:opacity-100">
                  <X size={16} />
                </button>
              </div>
              {t.type === 'success' && t.filePath && (
                <div className="mt-3 space-y-3">
                  {/* Metadata Verification Display */}
                  {t.metadataVerification && (
                    <div className="bg-white/10 rounded p-3 text-xs space-y-2">
                      <div className="font-semibold flex items-center gap-2">
                        {t.metadataVerification.success ? (
                          <CheckCircle size={14} className="text-green-300" />
                        ) : (
                          <AlertCircle size={14} className="text-yellow-300" />
                        )}
                        AIFF Tags Embedded ({t.metadataVerification.allTags?.length || 0} tags)
                      </div>
                      {t.metadataVerification.success && (
                        <div className="grid grid-cols-1 gap-1 text-white/80">
                          {t.metadataVerification.title && <div>• Title: {t.metadataVerification.title}</div>}
                          {t.metadataVerification.artist && <div>• Artist: {t.metadataVerification.artist}</div>}
                          {t.metadataVerification.album && <div>• Album: {t.metadataVerification.album}</div>}
                          {t.metadataVerification.date && <div>• Date: {t.metadataVerification.date}</div>}
                          {t.metadataVerification.genre && <div>• Genre: {t.metadataVerification.genre}</div>}
                          {t.metadataVerification.label && <div>• Label: {t.metadataVerification.label}</div>}
                          {t.metadataVerification.country && <div>• Country: {t.metadataVerification.country}</div>}
                        </div>
                      )}
                      {t.metadataVerification.allTags && t.metadataVerification.allTags.length > 0 && (
                        <div className="text-white/60 text-xs">
                          Tags: {t.metadataVerification.allTags.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <button
                    onClick={async () => {
                      try {
                        await axios.post('/api/reveal', { filePath: t.filePath });
                      } catch (e) {
                        // show an error toast if reveal fails
                        const id = Date.now() + 1;
                        setToasts(prev => [...prev, { id, type: 'error', title: 'Reveal failed', message: e instanceof Error ? e.message : 'Unknown error' }]);
                        setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 6000);
                      }
                    }}
                    className="bg-white/20 hover:bg-white/30 text-white text-sm px-3 py-1 rounded w-full"
                  >
                    Reveal in Finder
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
