import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Progress } from './ui/progress';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Alert, AlertDescription } from './ui/alert';
import { motion, AnimatePresence } from 'motion/react';
import { SEOHead } from './SEOHead';
import {
  Upload,
  Eye,
  Car,
  Shield,
  Download,
  FileVideo,
  FileImage,
  X,
  CheckCircle,
  AlertCircle,
  Zap,
  Scissors,
  Info,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { api, MediaResponse, RemoveBgStatus } from '../utils/api';

interface CensoringPageProps {
  onNavigate: (page: string) => void;
}

interface ProcessedFile {
  id: string;
  name: string;
  type: 'image' | 'video';
  previewUrl: string;
  size: string;
  bgRemoved: boolean;
}

export function CensoringPage({ onNavigate }: CensoringPageProps) {
  // ── Censoring options ──
  const [censorOptions, setCensorOptions] = useState({
    faces: true,
    plates: true,
    removeBg: false,
  });

  // ══════════════════════════════════════════════════════════════
  // 6.2 + 6.3: Состояния для Remove.bg
  // ══════════════════════════════════════════════════════════════
  // Три состояния:
  // 1. loading: проверяем доступность (показываем скелетон)
  // 2. available: API настроен (показываем чекбокс)
  // 3. unavailable: API не настроен (показываем info-блок)
  // 4. error: не удалось проверить (показываем warning)
  // ══════════════════════════════════════════════════════════════
  const [removeBgStatus, setRemoveBgStatus] = useState<{
    loading: boolean;
    available: boolean;
    error: string | null;
    message: string;
    rateLimit: number;
  }>({
    loading: true,
    available: false,
    error: null,
    message: '',
    rateLimit: 0,
  });

  // ── File state ──
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'processing' | 'complete'>('upload');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ══════════════════════════════════════════════════════════════
  // 6.2: Проверка доступности Remove.bg с обработкой ошибок
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    const checkRemoveBg = async () => {
      setRemoveBgStatus(prev => ({ ...prev, loading: true, error: null }));
      try {
        const status: RemoveBgStatus = await api.getRemoveBgStatus();
        setRemoveBgStatus({
          loading: false,
          available: status.available,
          error: null,
          message: status.message,
          rateLimit: status.rate_limit_per_minute,
        });
      } catch (err: any) {
        // 6.3: Graceful degradation — ошибка проверки не ломает страницу
        setRemoveBgStatus({
          loading: false,
          available: false,
          error: err.message || 'Could not check Remove.bg status',
          message: '',
          rateLimit: 0,
        });
      }
    };
    checkRemoveBg();
  }, []);

  // ── Если Remove.bg стал недоступен, сбрасываем чекбокс ──
  useEffect(() => {
    if (!removeBgStatus.available && censorOptions.removeBg) {
      setCensorOptions(prev => ({ ...prev, removeBg: false }));
    }
  }, [removeBgStatus.available]);

  // ── File handlers ──

  const handleFileUpload = (files: FileList | File[]) => {
    const newFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    if (newFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ── Processing ──

  const handleStartProcessing = async () => {
    if (uploadedFiles.length === 0) return;

    setError(null);
    setCurrentStep('processing');
    setIsProcessing(true);
    setProgress(0);
    setIsUploading(true);

    const startTime = Date.now();

    try {
      const uploadedMedia: MediaResponse[] = [];

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const fileProgress = ((i + 1) / uploadedFiles.length) * 100;

        try {
          const media = await api.uploadMedia(
            file,
            `Processed with ${getCensoringText()}`,
            censorOptions.removeBg,
          );
          uploadedMedia.push(media);
          setProgress(fileProgress);
        } catch (err: any) {
          console.error(`Error uploading ${file.name}:`, err);
          throw new Error(`Failed to upload ${file.name}: ${err.message}`);
        }
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 1000) {
        await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
      }

      const processedFilesData = await Promise.all(
        uploadedMedia.map(async (media) => {
          const originalUrl = media.original_url;
          const lastPart = originalUrl.split('/').pop() || '';
          const cleanFileName = lastPart.split('?')[0] || `file-${media.id}`;
          const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(cleanFileName);

          let previewUrl = '';
          if (isImage) {
            try {
              const blob = await api.downloadMedia(media.id);
              previewUrl = URL.createObjectURL(blob);
            } catch (err) {
              console.warn(`Failed to load preview for ${media.id}`);
            }
          }

          return {
            id: media.id.toString(),
            name: cleanFileName,
            type: (isImage ? 'image' : 'video') as 'image' | 'video',
            previewUrl,
            size: 'Unknown',
            // 6.1: Показываем статус удаления фона в результатах
            bgRemoved: media.bg_removed || false,
          };
        })
      );

      setProcessedFiles(processedFilesData);
      setIsProcessing(false);
      setIsUploading(false);
      setCurrentStep('complete');
      setUploadedFiles([]);
    } catch (err: any) {
      setError(err.message || 'Failed to process files. Please try again.');
      setIsProcessing(false);
      setIsUploading(false);
      setCurrentStep('upload');
    }
  };

  const handleStartOver = () => {
    processedFiles.forEach(f => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setUploadedFiles([]);
    setProcessedFiles([]);
    setProgress(0);
    setCurrentStep('upload');
  };

  const downloadFile = async (file: ProcessedFile) => {
    try {
      setError(null);
      const blob = await api.downloadMedia(parseInt(file.id, 10));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `censored_${file.name}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error downloading media:', err);
      setError(err.message || 'Failed to download file');
    }
  };

  const downloadAll = async () => {
    for (const file of processedFiles) {
      await downloadFile(file);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getCensoringText = () => {
    const parts: string[] = [];
    if (censorOptions.faces) parts.push('face blurring');
    if (censorOptions.plates) parts.push('plate blurring');
    if (censorOptions.removeBg) parts.push('background removal');
    return parts.length > 0 ? parts.join(', ') : 'nothing selected';
  };

  const hasAnyOption = censorOptions.faces || censorOptions.plates || censorOptions.removeBg;

  return (
    <>
      <SEOHead
        title="Upload & Censor Files"
        description="Upload photos and videos to automatically blur faces and license plates with AI-powered privacy protection."
        path="/censoring"
        noIndex={true}
      />

      <main className="min-h-screen bg-secondary/5 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl lg:text-4xl font-bold text-primary mb-3">
              Upload &amp; Censor Files
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload your photos or videos and let our AI automatically protect privacy
              by blurring sensitive information
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6" role="alert">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Progress Steps */}
          <nav className="flex items-center justify-center mb-8" aria-label="Processing steps">
            <ol className="flex items-center space-x-4">
              <li className={`flex items-center space-x-2 ${currentStep === 'upload' ? 'text-primary' : currentStep === 'processing' || currentStep === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'upload' ? 'bg-primary text-primary-foreground' : currentStep === 'processing' || currentStep === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {currentStep === 'processing' || currentStep === 'complete' ? <CheckCircle className="w-4 h-4" aria-hidden="true" /> : '1'}
                </div>
                <span className="font-medium">Upload</span>
              </li>
              <li aria-hidden="true" className={`w-12 h-px ${currentStep === 'processing' || currentStep === 'complete' ? 'bg-green-600' : 'bg-muted'}`} />
              <li className={`flex items-center space-x-2 ${currentStep === 'processing' ? 'text-primary' : currentStep === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'processing' ? 'bg-primary text-primary-foreground' : currentStep === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {currentStep === 'complete' ? <CheckCircle className="w-4 h-4" aria-hidden="true" /> : currentStep === 'processing' ? <Zap className="w-4 h-4" aria-hidden="true" /> : '2'}
                </div>
                <span className="font-medium">Process</span>
              </li>
              <li aria-hidden="true" className={`w-12 h-px ${currentStep === 'complete' ? 'bg-green-600' : 'bg-muted'}`} />
              <li className={`flex items-center space-x-2 ${currentStep === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {currentStep === 'complete' ? <CheckCircle className="w-4 h-4" aria-hidden="true" /> : '3'}
                </div>
                <span className="font-medium">Download</span>
              </li>
            </ol>
          </nav>

          <AnimatePresence mode="wait">
            {/* ═══ STEP 1: UPLOAD ═══ */}
            {currentStep === 'upload' && (
              <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
                {/* Censoring Options */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="w-5 h-5" aria-hidden="true" />
                      Processing Options
                    </CardTitle>
                    <CardDescription>
                      Choose what to automatically detect and process in your files
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <fieldset>
                      <legend className="sr-only">Select processing options</legend>

                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Blur Faces */}
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                          <Checkbox id="faces" checked={censorOptions.faces} onCheckedChange={(checked) => setCensorOptions(prev => ({ ...prev, faces: !!checked }))} />
                          <div className="flex items-center space-x-3 flex-1">
                            <Eye className="w-5 h-5 text-primary" aria-hidden="true" />
                            <div>
                              <label htmlFor="faces" className="cursor-pointer font-medium">Blur Faces</label>
                              <p className="text-sm text-muted-foreground">Detect and blur human faces</p>
                            </div>
                          </div>
                        </div>

                        {/* Blur License Plates */}
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                          <Checkbox id="plates" checked={censorOptions.plates} onCheckedChange={(checked) => setCensorOptions(prev => ({ ...prev, plates: !!checked }))} />
                          <div className="flex items-center space-x-3 flex-1">
                            <Car className="w-5 h-5 text-primary" aria-hidden="true" />
                            <div>
                              <label htmlFor="plates" className="cursor-pointer font-medium">Blur License Plates</label>
                              <p className="text-sm text-muted-foreground">Detect and blur license plates</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ═══════════════════════════════════════════════ */}
                      {/* 6.1 + 6.2 + 6.3: Remove Background section    */}
                      {/* Три состояния: loading / available / unavail.  */}
                      {/* ═══════════════════════════════════════════════ */}
                      <div className="mt-4">
                        {/* 6.2: Loading state — скелетон пока проверяем API */}
                        {removeBgStatus.loading && (
                          <div className="flex items-center space-x-3 p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50/50">
                            <div className="w-5 h-5">
                              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" aria-hidden="true" />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-muted-foreground">Checking Remove.bg service...</p>
                              <p className="text-sm text-muted-foreground">Loading external API status</p>
                            </div>
                          </div>
                        )}

                        {/* 6.1: Available — показываем рабочий чекбокс */}
                        {!removeBgStatus.loading && removeBgStatus.available && (
                          <div className="flex items-center space-x-3 p-4 border border-dashed border-purple-300 rounded-lg hover:bg-purple-50/50 transition-colors">
                            <Checkbox
                              id="removeBg"
                              checked={censorOptions.removeBg}
                              onCheckedChange={(checked) => setCensorOptions(prev => ({ ...prev, removeBg: !!checked }))}
                            />
                            <div className="flex items-center space-x-3 flex-1">
                              <Scissors className="w-5 h-5 text-purple-500" aria-hidden="true" />
                              <div>
                                <label htmlFor="removeBg" className="cursor-pointer font-medium">
                                  Remove Background
                                  <Badge variant="secondary" className="ml-2 text-xs bg-purple-100 text-purple-700">
                                    External API
                                  </Badge>
                                </label>
                                <p className="text-sm text-muted-foreground">
                                  Remove image background using AI (powered by Remove.bg)
                                </p>
                                {removeBgStatus.rateLimit > 0 && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Rate limit: {removeBgStatus.rateLimit} requests/minute
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 6.3: Unavailable — graceful degradation info */}
                        {!removeBgStatus.loading && !removeBgStatus.available && !removeBgStatus.error && (
                          <div className="flex items-center space-x-3 p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50/50">
                            <Info className="w-5 h-5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                            <div className="flex-1">
                              <p className="font-medium text-muted-foreground">
                                Background Removal
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Unavailable
                                </Badge>
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Remove.bg service is not configured. Contact administrator to enable this feature.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* 6.2: Error state — не удалось проверить */}
                        {!removeBgStatus.loading && removeBgStatus.error && (
                          <div className="flex items-center space-x-3 p-4 border border-dashed border-orange-300 rounded-lg bg-orange-50/50">
                            <WifiOff className="w-5 h-5 text-orange-500 flex-shrink-0" aria-hidden="true" />
                            <div className="flex-1">
                              <p className="font-medium text-orange-700">
                                Background Removal
                                <Badge variant="outline" className="ml-2 text-xs border-orange-300 text-orange-600">
                                  Error
                                </Badge>
                              </p>
                              <p className="text-sm text-orange-600">
                                Could not check service status: {removeBgStatus.error}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Face and plate blurring still works normally.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </fieldset>

                    {/* Warning: nothing selected */}
                    {!hasAnyOption && (
                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2" role="alert">
                        <AlertCircle className="w-4 h-4 text-yellow-600" aria-hidden="true" />
                        <span className="text-sm text-yellow-800">Please select at least one processing option</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Upload Area */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="w-5 h-5" aria-hidden="true" />
                      Upload Files
                    </CardTitle>
                    <CardDescription>Drop your photos and videos here, or click to select files</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer ${dragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border hover:border-primary/50 hover:bg-accent/50'}`}
                      onClick={() => fileInputRef.current?.click()}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      role="button"
                      tabIndex={0}
                      aria-label="Upload area — click or drag files here"
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                    >
                      <Upload className={`w-16 h-16 mx-auto mb-4 transition-colors ${dragActive ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                      <h3 className="text-xl font-semibold mb-2">{dragActive ? 'Drop files here' : 'Drag & drop files here'}</h3>
                      <p className="text-muted-foreground mb-4">or click to select from your device</p>
                      <p className="text-sm text-muted-foreground">Supports JPEG, PNG, MP4, MOV and other common formats</p>
                      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleInputChange} className="hidden" aria-label="Select files to upload" />
                    </div>

                    {/* Uploaded Files List */}
                    {uploadedFiles.length > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-6">
                        <h4 className="font-semibold mb-4 flex items-center gap-2">
                          <FileImage className="w-4 h-4" aria-hidden="true" />
                          Uploaded Files ({uploadedFiles.length})
                        </h4>
                        <ul className="space-y-3 max-h-64 overflow-y-auto">
                          {uploadedFiles.map((file, index) => (
                            <motion.li key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                              <div className="flex items-center space-x-3">
                                {file.type.startsWith('image/') ? <FileImage className="w-5 h-5 text-primary" aria-hidden="true" /> : <FileVideo className="w-5 h-5 text-primary" aria-hidden="true" />}
                                <div>
                                  <p className="font-medium truncate max-w-xs">{file.name}</p>
                                  <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => removeFile(index)} className="hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${file.name}`}>
                                <X className="w-4 h-4" aria-hidden="true" />
                              </Button>
                            </motion.li>
                          ))}
                        </ul>
                      </motion.div>
                    )}

                    {/* Start Processing Button */}
                    {uploadedFiles.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                        <Button onClick={handleStartProcessing} disabled={!hasAnyOption} size="lg" className="w-full">
                          <Zap className="w-5 h-5 mr-2" aria-hidden="true" />
                          Start Processing ({uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''})
                        </Button>
                        <p className="text-center text-sm text-muted-foreground mt-2">
                          Will apply: {getCensoringText()}
                        </p>
                      </motion.div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ═══ STEP 2: PROCESSING ═══ */}
            {currentStep === 'processing' && (
              <motion.div key="processing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <Card>
                  <CardContent className="p-12 text-center">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="w-16 h-16 mx-auto mb-6" aria-hidden="true">
                      <Zap className="w-full h-full text-primary" />
                    </motion.div>
                    <h2 className="text-2xl font-semibold mb-2">Processing your files...</h2>
                    <p className="text-muted-foreground mb-4">
                      Applying {getCensoringText()} to your {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''}
                    </p>
                    {/* 6.1: Показываем какие именно шаги выполняются */}
                    <div className="flex flex-wrap justify-center gap-2 mb-6">
                      {censorOptions.faces && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Eye className="w-3 h-3" aria-hidden="true" /> Face Blur
                        </Badge>
                      )}
                      {censorOptions.plates && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Car className="w-3 h-3" aria-hidden="true" /> Plate Blur
                        </Badge>
                      )}
                      {censorOptions.removeBg && (
                        <Badge variant="secondary" className="flex items-center gap-1 bg-purple-100 text-purple-700">
                          <Scissors className="w-3 h-3" aria-hidden="true" /> BG Removal
                        </Badge>
                      )}
                    </div>
                    <div className="max-w-md mx-auto" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className="flex justify-between text-sm mb-2">
                        <span>{progress < 50 ? 'Uploading...' : 'Processing...'}</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ═══ STEP 3: COMPLETE ═══ */}
            {currentStep === 'complete' && (
              <motion.div key="complete" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <Card>
                  <CardHeader className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4" aria-hidden="true">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <CardTitle className="text-2xl">Processing Complete!</CardTitle>
                    <CardDescription>Your files have been successfully processed and are ready for download</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                      {processedFiles.map((file) => (
                        <div key={file.id} className="border rounded-lg overflow-hidden">
                          <div className="relative h-48">
                            <ImageWithFallback
                              src={file.previewUrl || ''}
                              alt={`Privacy-processed version of ${file.name} with ${getCensoringText()} applied`}
                              className="w-full h-full object-cover"
                            />
                            {/* 6.1: Бейджи статуса обработки */}
                            <div className="absolute top-2 right-2 flex gap-1">
                              <span className="bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                                Censored
                              </span>
                              {file.bgRemoved && (
                                <span className="bg-purple-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                                  <Scissors className="w-3 h-3" aria-hidden="true" />
                                  BG Removed
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium truncate" title={file.name}>{file.name}</p>
                                <p className="text-sm text-muted-foreground">{file.size}</p>
                              </div>
                              <Button size="sm" onClick={() => downloadFile(file)}>
                                <Download className="w-4 h-4 mr-1" aria-hidden="true" />
                                Download
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button onClick={downloadAll} className="flex-1">
                        <Download className="w-4 h-4 mr-2" aria-hidden="true" />
                        Download All Files
                      </Button>
                      <Button variant="outline" onClick={handleStartOver} className="flex-1">
                        Process More Files
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  );
}