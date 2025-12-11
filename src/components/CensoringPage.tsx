import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Progress } from './ui/progress';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Alert, AlertDescription } from './ui/alert';
import { motion, AnimatePresence } from 'motion/react';
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
  Zap
} from 'lucide-react';
import { api, MediaResponse } from '../utils/api';

interface CensoringPageProps {
  onNavigate: (page: any) => void;
}

interface ProcessedFile {
  id: string;
  name: string;
  type: 'image' | 'video';
  originalUrl: string;
  processedUrl: string;
  size: string;
}

export function CensoringPage({ onNavigate }: CensoringPageProps) {
  const [censorOptions, setCensorOptions] = useState({
    faces: true,
    plates: true
  });
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'processing' | 'complete'>('upload');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleStartProcessing = async () => {
    if (uploadedFiles.length === 0) return;
    
    setError(null);
    setCurrentStep('processing');
    setIsProcessing(true);
    setProgress(0);
    setIsUploading(true);
    
    try {
      const uploadedMedia: MediaResponse[] = [];
      
      // Upload files one by one
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const fileProgress = ((i + 1) / uploadedFiles.length) * 100;
        
        try {
          const media = await api.uploadMedia(file, `Processed with ${getCensoringText()}`);
          uploadedMedia.push(media);
          setProgress(fileProgress);
        } catch (err: any) {
          console.error(`Error uploading ${file.name}:`, err);
          throw new Error(`Failed to upload ${file.name}: ${err.message}`);
        }
      }
      
      // Convert to ProcessedFile format
      const processedFilesData: ProcessedFile[] = uploadedMedia.map((media) => ({
        id: media.id.toString(),
        name: media.original_url.split('/').pop() || `file-${media.id}`,
        type: media.original_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video',
        originalUrl: media.original_url,
        processedUrl: media.processed_url || media.original_url,
        size: 'Unknown' // Size not available from API
      }));
      
      setProcessedFiles(processedFilesData);
      setIsProcessing(false);
      setIsUploading(false);
      setCurrentStep('complete');
      setUploadedFiles([]); // Clear uploaded files after processing
    } catch (err: any) {
      setError(err.message || 'Failed to process files. Please try again.');
      setIsProcessing(false);
      setIsUploading(false);
      setCurrentStep('upload');
    }
  };

  const handleStartOver = () => {
    setUploadedFiles([]);
    setProcessedFiles([]);
    setProgress(0);
    setCurrentStep('upload');
  };

  const downloadFile = (file: ProcessedFile) => {
    const link = document.createElement('a');
    link.href = file.processedUrl;
    link.download = `censored_${file.name}`;
    link.target = '_blank';
    link.click();
  };

  const downloadAll = () => {
    processedFiles.forEach(file => downloadFile(file));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getCensoringText = () => {
    if (censorOptions.faces && censorOptions.plates) return 'faces and license plates';
    if (censorOptions.faces) return 'faces';
    if (censorOptions.plates) return 'license plates';
    return 'nothing selected';
  };

  return (
    <div className="min-h-screen bg-secondary/5 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold text-primary mb-3">
            Upload & Censor Files
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload your photos or videos and let our AI automatically protect privacy by blurring sensitive information
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 ${currentStep === 'upload' ? 'text-primary' : currentStep === 'processing' || currentStep === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'upload' ? 'bg-primary text-primary-foreground' : currentStep === 'processing' || currentStep === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                {currentStep === 'processing' || currentStep === 'complete' ? <CheckCircle className="w-4 h-4" /> : '1'}
              </div>
              <span className="font-medium">Upload</span>
            </div>
            
            <div className={`w-12 h-px ${currentStep === 'processing' || currentStep === 'complete' ? 'bg-green-600' : 'bg-muted'}`} />
            
            <div className={`flex items-center space-x-2 ${currentStep === 'processing' ? 'text-primary' : currentStep === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'processing' ? 'bg-primary text-primary-foreground' : currentStep === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                {currentStep === 'complete' ? <CheckCircle className="w-4 h-4" /> : currentStep === 'processing' ? <Zap className="w-4 h-4" /> : '2'}
              </div>
              <span className="font-medium">Process</span>
            </div>
            
            <div className={`w-12 h-px ${currentStep === 'complete' ? 'bg-green-600' : 'bg-muted'}`} />
            
            <div className={`flex items-center space-x-2 ${currentStep === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                {currentStep === 'complete' ? <CheckCircle className="w-4 h-4" /> : '3'}
              </div>
              <span className="font-medium">Download</span>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {currentStep === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Censoring Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Censoring Options
                  </CardTitle>
                  <CardDescription>
                    Choose what to automatically detect and blur in your files
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                      <Checkbox
                        id="faces"
                        checked={censorOptions.faces}
                        onCheckedChange={(checked) => setCensorOptions(prev => ({ ...prev, faces: !!checked }))}
                      />
                      <div className="flex items-center space-x-3 flex-1">
                        <Eye className="w-5 h-5 text-primary" />
                        <div>
                          <label htmlFor="faces" className="cursor-pointer font-medium">Blur Faces</label>
                          <p className="text-sm text-muted-foreground">Detect and blur human faces</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                      <Checkbox
                        id="plates"
                        checked={censorOptions.plates}
                        onCheckedChange={(checked) => setCensorOptions(prev => ({ ...prev, plates: !!checked }))}
                      />
                      <div className="flex items-center space-x-3 flex-1">
                        <Car className="w-5 h-5 text-primary" />
                        <div>
                          <label htmlFor="plates" className="cursor-pointer font-medium">Blur License Plates</label>
                          <p className="text-sm text-muted-foreground">Detect and blur license plates</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {(!censorOptions.faces && !censorOptions.plates) && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm text-yellow-800">Please select at least one censoring option</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Upload Area */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Upload Files
                  </CardTitle>
                  <CardDescription>
                    Drop your photos and videos here, or click to select files
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer ${
                      dragActive 
                        ? 'border-primary bg-primary/5 scale-[1.02]' 
                        : 'border-border hover:border-primary/50 hover:bg-accent/50'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <Upload className={`w-16 h-16 mx-auto mb-4 transition-colors ${dragActive ? 'text-primary' : 'text-muted-foreground'}`} />
                    <h3 className="text-xl font-semibold mb-2">
                      {dragActive ? 'Drop files here' : 'Drag & drop files here'}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      or click to select from your device
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Supports JPEG, PNG, MP4, MOV and other common formats
                    </p>
                    
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      onChange={handleInputChange}
                      className="hidden"
                    />
                  </div>

                  {/* Uploaded Files List */}
                  {uploadedFiles.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-6"
                    >
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <FileImage className="w-4 h-4" />
                        Uploaded Files ({uploadedFiles.length})
                      </h4>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {uploadedFiles.map((file, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center justify-between p-3 bg-background rounded-lg border"
                          >
                            <div className="flex items-center space-x-3">
                              {file.type.startsWith('image/') ? (
                                <FileImage className="w-5 h-5 text-primary" />
                              ) : (
                                <FileVideo className="w-5 h-5 text-primary" />
                              )}
                              <div>
                                <p className="font-medium truncate max-w-xs">{file.name}</p>
                                <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                              className="hover:bg-destructive/10 hover:text-destructive"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Start Processing Button */}
                  {uploadedFiles.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6"
                    >
                      <Button 
                        onClick={handleStartProcessing}
                        disabled={!censorOptions.faces && !censorOptions.plates}
                        size="lg"
                        className="w-full"
                      >
                        <Zap className="w-5 h-5 mr-2" />
                        Start Processing ({uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''})
                      </Button>
                      <p className="text-center text-sm text-muted-foreground mt-2">
                        Will blur {getCensoringText()} in your files
                      </p>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card>
                <CardContent className="p-12 text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 mx-auto mb-6"
                  >
                    <Zap className="w-full h-full text-primary" />
                  </motion.div>
                  
                  <h3 className="text-2xl font-semibold mb-2">Processing your files...</h3>
                  <p className="text-muted-foreground mb-6">
                    Our AI is analyzing and censoring {getCensoringText()} in your {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''}
                  </p>
                  
                  <div className="max-w-md mx-auto">
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

          {currentStep === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card>
                <CardHeader className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <CardTitle className="text-2xl">Processing Complete!</CardTitle>
                  <CardDescription>
                    Your files have been successfully processed and are ready for download
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    {processedFiles.map((file) => (
                      <div key={file.id} className="border rounded-lg overflow-hidden">
                        <div className="relative">
                          <ImageWithFallback
                            src={file.processedUrl}
                            alt={`Processed ${file.name}`}
                            className="w-full h-48 object-cover"
                          />
                          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                            Censored
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium truncate">{file.name}</p>
                              <p className="text-sm text-muted-foreground">{file.size}</p>
                            </div>
                            <Button size="sm" onClick={() => downloadFile(file)}>
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button onClick={downloadAll} className="flex-1">
                      <Download className="w-4 h-4 mr-2" />
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
    </div>
  );
}