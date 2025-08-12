'use client';

import { useState, useCallback } from 'react';
import { Download, Music, Play, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
import axios from 'axios';

interface Track {
  id: string;
  title: string;
  uploader: string;
  duration?: string;
  thumbnail?: string;
  status: 'pending' | 'downloading' | 'converting' | 'completed' | 'error';
  progress?: number;
  error?: string;
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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setError('');
    setPlaylist(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze URL');
      }

      const data = await response.json();
      setPlaylist(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  const handleDownload = useCallback(async (trackId: string) => {
    if (!playlist) return;

    setPlaylist(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        tracks: prev.tracks.map(track =>
          track.id === trackId
            ? { ...track, status: 'downloading' as const, progress: 0 }
            : track
        ),
      };
    });

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setPlaylist(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            tracks: prev.tracks.map(track =>
              track.id === trackId
                ? { ...track, progress: Math.min((track.progress || 0) + 10, 90) }
                : track
            ),
          };
        });
      }, 500);

      const response = await axios.post('/api/download', {
        url: url.trim(),
        trackId,
        format: 'aiff',
        saveDirectory: saveDirectory.trim() || undefined
      });

      clearInterval(progressInterval);

      if (response.data.success) {
        // Update track status to completed
        setPlaylist(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            tracks: prev.tracks.map(track =>
              track.id === trackId
                ? { ...track, status: 'completed' as const, progress: 100 }
                : track
            ),
          };
        });
      } else {
        throw new Error(response.data.error || 'Download failed');
      }
    } catch (err) {
      console.error('Download error:', err);
      setPlaylist(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          tracks: prev.tracks.map(track =>
            track.id === trackId
              ? { ...track, status: 'error' as const, error: err instanceof Error ? err.message : 'Download failed' }
              : track
          ),
        };
      });
    }
  }, [playlist, url]);

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
          // Update track status
          setPlaylist(prev => prev ? {
            ...prev,
            tracks: prev.tracks.map(t => 
              t.id === track.id ? { ...t, status: 'completed' } : t
            )
          } : null);
          
          return { success: true, track, message: 'Download completed' };
        } else {
          throw new Error(response.data.error || 'Download failed');
        }
      } catch (error) {
        console.error(`Download failed for track ${track.title}:`, error);
        
        // Update track status to failed
        setPlaylist(prev => prev ? {
          ...prev,
          tracks: prev.tracks.map(t => 
            t.id === track.id ? { ...t, status: 'error' as const, error: error instanceof Error ? error.message : 'Unknown error' } : t
          )
        } : null);
        
        return { 
          success: false, 
          track, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    });

    try {
      const results = await Promise.allSettled(downloadPromises);
      
      // Count successful and failed downloads
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
      
      setCompletionStats({
        total: playlist.tracks.length,
        successful,
        failed
      });
      
      setShowCompletionModal(true);
    } catch (error) {
      console.error('Batch download error:', error);
      setError('Batch download failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsBatchDownloading(false);
    }
  }, [playlist, url]);

  const getStatusIcon = useCallback((status: Track['status']) => {
    switch (status) {
      case 'pending':
        return <Music className="w-4 h-4 text-gray-400" />;
      case 'downloading':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'converting':
        return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Music className="w-4 h-4 text-gray-400" />;
    }
  }, []);

  const getStatusText = useCallback((status: Track['status']) => {
    switch (status) {
      case 'pending':
        return 'Ready';
      case 'downloading':
        return 'Downloading...';
      case 'converting':
        return 'Converting to AIFF...';
      case 'completed':
        return 'Downloaded';
      case 'error':
        return 'Error';
      default:
        return 'Ready';
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            Audio Downloader
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Download and convert audio from SoundCloud, YouTube, and more to high-quality AIFF format with full metadata preservation.
          </p>
        </div>

        {/* URL Input Form */}
        <div className="max-w-4xl mx-auto mb-8">
          <form onSubmit={handleSubmit} className="flex gap-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                  Audio URL
                </label>
                <input
                  type="url"
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://youtube.com/playlist?list=..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="saveDirectory" className="block text-sm font-medium text-gray-700 mb-2">
                  Save Directory
                </label>
                <div className="space-y-2">
                  <select
                    id="saveDirectory"
                    value={saveDirectory}
                    onChange={(e) => setSaveDirectory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  
                  <p className="text-xs text-gray-500">
                    💡 <strong>Quick Tips:</strong> Use ~ for home directory, drag folders from Finder, or type custom paths
                  </p>
                </div>
              </div>
              
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Analyzing...' : 'Analyze URL'}
              </button>
            </div>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <span className="text-red-200">{error}</span>
            </div>
          </div>
        )}

        {/* Playlist Display */}
        {playlist && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{playlist.title}</h2>
                  <p className="text-gray-300">{playlist.trackCount} tracks</p>
                </div>
                <button
                  onClick={handleDownloadAll}
                  disabled={isBatchDownloading}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center gap-2"
                >
                  {isBatchDownloading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Download All as AIFF
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {playlist.tracks.map((track, index) => (
                <div
                  key={`${track.id}-${index}`}
                  className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 flex items-center gap-4"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-gray-400 text-sm font-mono w-8">
                      {(index + 1).toString().padStart(2, '0')}
                    </div>
                    {getStatusIcon(track.status)}
                    <div className="flex-1">
                      <h3 className="text-white font-medium">{track.title}</h3>
                      <p className="text-gray-400 text-sm">{track.uploader}</p>
                      {track.duration && (
                        <p className="text-gray-500 text-xs">{track.duration}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-300">
                      {getStatusText(track.status)}
                    </span>
                    {track.status === 'downloading' && track.progress !== undefined && (
                      <div className="w-24 bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${track.progress}%` }}
                        />
                      </div>
                    )}
                    {track.status === 'pending' && (
                      <button
                        onClick={() => handleDownload(track.id)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    )}
                    {track.status === 'error' && track.error && (
                      <span className="text-red-400 text-sm">{track.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Features Section */}
        {!playlist && !isLoading && (
          <div className="max-w-4xl mx-auto mt-16">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 text-center">
                <Music className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Multiple Sources</h3>
                <p className="text-gray-300">Support for SoundCloud, YouTube, and 1,800+ other sites</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 text-center">
                <Download className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">AIFF Format</h3>
                <p className="text-gray-300">Lossless audio quality with full metadata preservation</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 text-center">
                <Play className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Playlist Support</h3>
                <p className="text-gray-300">Download entire playlists with one click</p>
              </div>
            </div>
          </div>
        )}

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
                Files have been saved to your Downloads/AudioDownloader folder.
              </p>
              <button
                onClick={() => setShowCompletionModal(false)}
                className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
