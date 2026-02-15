import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { ImageWithFallback } from './figma/ImageWithFallback';
import {
  Download, RotateCcw, Trash2, Eye, Car, Shield,
  Calendar, FileVideo, FileImage, AlertCircle, Loader2
} from 'lucide-react';
import { api, MediaResponse, User } from '../utils/api';

interface ProcessedFile {
  id: string;
  name: string;
  type: 'image' | 'video';
  previewUrl: string;
  processedDate: string;
  censorType: 'faces' | 'plates' | 'both';
  size: string;
  userId: number; // НОВОЕ
}

interface DashboardPageProps {
  onNavigate: (page: any) => void;
  user: User | null; // НОВОЕ
}

export function DashboardPage({ onNavigate, user }: DashboardPageProps) {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [filter, setFilter] = useState<'all' | 'images' | 'videos'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  const convertMediaToFile = (media: MediaResponse): Omit<ProcessedFile, 'previewUrl'> => {
    const originalUrl = media.original_url;
    const lastPart = originalUrl.split('/').pop() || '';
    const cleanFileName = lastPart.split('?')[0] || `file-${media.id}`;
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(cleanFileName);

    return {
      id: media.id.toString(),
      name: cleanFileName,
      type: isImage ? 'image' : 'video',
      processedDate: new Date().toISOString().split('T')[0],
      censorType: 'both',
      size: 'Unknown',
      userId: media.user_id,
    };
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const loadMedia = async () => {
    setIsLoading(true);
    setError(null);
    files.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl));

    try {
      // Backend уже возвращает все файлы для admin, свои для user
      const mediaList = await api.listMedia();
      const convertedFiles = mediaList.map(convertMediaToFile);

      const filesWithPreviews = await Promise.all(
        convertedFiles.map(async (file) => {
          if (file.type === 'image') {
            try {
              const blob = await api.downloadMedia(parseInt(file.id));
              const previewUrl = URL.createObjectURL(blob);
              return { ...file, previewUrl };
            } catch {
              return { ...file, previewUrl: '' };
            }
          }
          return { ...file, previewUrl: '' };
        })
      );

      setFiles(filesWithPreviews);
    } catch (err: any) {
      setError(err.message || 'Failed to load media files');
    } finally {
      setIsLoading(false);
    }
  };

  const getCensorIcon = (type: string) => {
    switch (type) {
      case 'faces': return <Eye className="w-4 h-4" />;
      case 'plates': return <Car className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getCensorLabel = (type: string) => {
    switch (type) {
      case 'faces': return 'Faces';
      case 'plates': return 'License Plates';
      default: return 'Faces & Plates';
    }
  };

  const handleDownload = async (file: ProcessedFile) => {
    try {
      setError(null);
      const blob = await api.downloadMedia(parseInt(file.id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download file');
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      await api.deleteMedia(parseInt(fileId));
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete file');
    }
  };

  const filteredFiles = files.filter(file => {
    if (filter === 'all') return true;
    if (filter === 'images') return file.type === 'image';
    if (filter === 'videos') return file.type === 'video';
    return true;
  });

  const stats = {
    total: files.length,
    images: files.filter(f => f.type === 'image').length,
    videos: files.filter(f => f.type === 'video').length,
  };

  return (
    <div className="min-h-screen bg-secondary/10 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? 'Admin view — showing all users\' files'
              : 'Manage your processed files and download results'}
          </p>
          {isAdmin && (
            <Badge variant="default" className="mt-2">Admin Mode — All Files</Badge>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Files</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Shield className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Images</p>
                  <p className="text-2xl font-bold">{stats.images}</p>
                </div>
                <FileImage className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Videos</p>
                  <p className="text-2xl font-bold">{stats.videos}</p>
                </div>
                <FileVideo className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Files</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Download className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex gap-2">
            <Button variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>All Files</Button>
            <Button variant={filter === 'images' ? 'default' : 'outline'} onClick={() => setFilter('images')}>Images</Button>
            <Button variant={filter === 'videos' ? 'default' : 'outline'} onClick={() => setFilter('videos')}>Videos</Button>
          </div>
          <Button onClick={() => onNavigate('censoring')}>Process New Files</Button>
        </div>

        {/* Files Grid */}
        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
              <h3 className="text-xl font-semibold mb-2">Loading files...</h3>
            </CardContent>
          </Card>
        ) : filteredFiles.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No files found</h3>
              <p className="text-muted-foreground mb-6">Start by uploading and processing your first files</p>
              <Button onClick={() => onNavigate('censoring')}>Process Files</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFiles.map((file) => (
              <Card key={file.id} className="overflow-hidden">
                <div className="relative">
                  <ImageWithFallback
                    src={file.previewUrl || ''}
                    alt={file.name}
                    className="w-full h-48 object-cover"
                  />
                  <div className="absolute top-2 right-2">
                    {file.type === 'image' ? (
                      <FileImage className="w-6 h-6 text-white bg-black/50 rounded p-1" />
                    ) : (
                      <FileVideo className="w-6 h-6 text-white bg-black/50 rounded p-1" />
                    )}
                  </div>
                  {/* Admin видит чей файл */}
                  {isAdmin && (
                    <div className="absolute top-2 left-2">
                      <Badge variant="outline" className="bg-black/60 text-white border-none text-xs">
                        User #{file.userId}
                      </Badge>
                    </div>
                  )}
                </div>

                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold truncate" title={file.name}>{file.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {file.processedDate}
                        <span>•</span>
                        {file.size}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        {getCensorIcon(file.censorType)}
                        {getCensorLabel(file.censorType)}
                      </Badge>
                    </div>

                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => handleDownload(file)} className="flex-1">
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onNavigate('censoring')} title="Reprocess">
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(file.id)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}