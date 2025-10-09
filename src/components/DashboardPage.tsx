import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { 
  Download, 
  RotateCcw, 
  Trash2, 
  Eye, 
  Car, 
  Shield, 
  Calendar,
  FileVideo,
  FileImage
} from 'lucide-react';

interface ProcessedFile {
  id: string;
  name: string;
  type: 'image' | 'video';
  thumbnail: string;
  processedDate: string;
  censorType: 'faces' | 'plates' | 'both';
  size: string;
}

interface DashboardPageProps {
  onNavigate: (page: any) => void;
}

// Mock data for processed files
const mockFiles: ProcessedFile[] = [
  {
    id: '1',
    name: 'family_photo.jpg',
    type: 'image',
    thumbnail: 'https://images.unsplash.com/photo-1646215218833-e217f7fffd18?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHhwaG90byUyMGVkaXRpbmclMjBibHVyJTIwY2Vuc29yaW5nfGVufDF8fHx8MTc1ODMwNDYzM3ww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    processedDate: '2025-01-19',
    censorType: 'both',
    size: '2.4 MB'
  },
  {
    id: '2',
    name: 'street_view.mp4',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1735103192623-314aa592ef7a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXIlMjBsaWNlbnNlJTIwcGxhdGUlMjB2ZWhpY2xlfGVufDF8fHx8MTc1ODMwNDYzNHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    processedDate: '2025-01-18',
    censorType: 'plates',
    size: '15.8 MB'
  },
  {
    id: '3',
    name: 'conference.jpg',
    type: 'image',
    thumbnail: 'https://images.unsplash.com/photo-1639503547276-90230c4a4198?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHhkYXRhJTIwcHJpdmFjeSUyMHNlY3VyaXR5JTIwc2hpZWxkfGVufDF8fHx8MTc1ODI4NzQ5Nnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    processedDate: '2025-01-17',
    censorType: 'faces',
    size: '4.1 MB'
  },
  {
    id: '4',
    name: 'parking_lot.jpg',
    type: 'image',
    thumbnail: 'https://images.unsplash.com/photo-1649004738101-ecef4d8411f9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1cGxvYWQlMjBjbG91ZCUyMHRlY2hub2xvZ3l8ZW58MXx8fHwxNzU4MzA0NjMzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    processedDate: '2025-01-16',
    censorType: 'both',
    size: '3.2 MB'
  }
];

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [files, setFiles] = useState<ProcessedFile[]>(mockFiles);
  const [filter, setFilter] = useState<'all' | 'images' | 'videos'>('all');

  const getCensorIcon = (type: string) => {
    switch (type) {
      case 'faces':
        return <Eye className="w-4 h-4" />;
      case 'plates':
        return <Car className="w-4 h-4" />;
      case 'both':
        return <Shield className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  const getCensorLabel = (type: string) => {
    switch (type) {
      case 'faces':
        return 'Faces';
      case 'plates':
        return 'License Plates';
      case 'both':
        return 'Faces & Plates';
      default:
        return 'Unknown';
    }
  };

  const handleDownload = (fileId: string) => {
    alert(`Downloading file ${fileId}`);
  };

  const handleReprocess = (fileId: string) => {
    alert(`Reprocessing file ${fileId}`);
  };

  const handleDelete = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
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
    totalSize: files.reduce((acc, file) => acc + parseFloat(file.size), 0).toFixed(1)
  };

  return (
    <div className="min-h-screen bg-secondary/10 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your processed files and download results
          </p>
        </div>

        {/* Stats Cards */}
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
                  <p className="text-sm text-muted-foreground">Storage Used</p>
                  <p className="text-2xl font-bold">{stats.totalSize} MB</p>
                </div>
                <Download className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions and Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
            >
              All Files
            </Button>
            <Button
              variant={filter === 'images' ? 'default' : 'outline'}
              onClick={() => setFilter('images')}
            >
              Images
            </Button>
            <Button
              variant={filter === 'videos' ? 'default' : 'outline'}
              onClick={() => setFilter('videos')}
            >
              Videos
            </Button>
          </div>
          
          <Button onClick={() => onNavigate('censoring')}>
            Process New Files
          </Button>
        </div>

        {/* Files Grid */}
        {filteredFiles.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No files found</h3>
              <p className="text-muted-foreground mb-6">
                Start by uploading and processing your first files
              </p>
              <Button onClick={() => onNavigate('censoring')}>
                Process Files
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFiles.map((file) => (
              <Card key={file.id} className="overflow-hidden">
                <div className="relative">
                  <ImageWithFallback
                    src={file.thumbnail}
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
                </div>
                
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold truncate" title={file.name}>
                        {file.name}
                      </h3>
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
                      <Button
                        size="sm"
                        onClick={() => handleDownload(file.id)}
                        className="flex-1"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReprocess(file.id)}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(file.id)}
                      >
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