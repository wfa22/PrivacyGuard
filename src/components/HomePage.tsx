import image_1c4e085c3e80dd157767a201559cf19c03d90b95 from 'figma:asset/1c4e085c3e80dd157767a201559cf19c03d90b95.png';
import image_709588cac4b001de1885bc6f3067749a346e8958 from 'figma:asset/709588cac4b001de1885bc6f3067749a346e8958.png';
import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Shield, Upload, Zap, Download, Eye, Car } from 'lucide-react';

interface HomePageProps {
  onNavigate: (page: any) => void;
  onGetStarted: () => void;
}

export function HomePage({ onNavigate, onGetStarted }: HomePageProps) {
  const handleViewDemo = () => {
    const element = document.getElementById('see-the-difference');
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/5 to-secondary/10 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl lg:text-6xl font-bold text-primary mb-6">
                Protect Privacy
                <br />
                <span className="text-secondary-foreground">Automatically</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Instantly blur faces and license plates in your photos and videos. 
                Our AI-powered service ensures privacy compliance and data protection 
                with professional-grade accuracy.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  onClick={onGetStarted}
                  className="px-8 py-3"
                >
                  Get Started Free
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={handleViewDemo}
                  className="px-8 py-3"
                >
                  View Demo
                </Button>
              </div>
            </div>
            <div className="relative">
              <ImageWithFallback
                src="https://images.unsplash.com/photo-1639503547276-90230c4a4198?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXRhJTIwcHJpdmFjeSUyMHNlY3VyaXR5JTIwc2hpZWxkfGVufDF8fHx8MTc1ODI4NzQ5Nnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                alt="Privacy and Security"
                className="rounded-2xl shadow-2xl w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Before/After Examples */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 id="see-the-difference" className="text-3xl lg:text-4xl font-bold text-primary mb-4">
              See the Difference
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Our advanced AI technology automatically detects and blurs sensitive information 
              while preserving image quality and context.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative">
                  <ImageWithFallback
                    src={image_709588cac4b001de1885bc6f3067749a346e8958}
                    alt="Before Processing"
                    className="w-full h-64 object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full">
                    Before
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="font-semibold mb-2">Original Image</h3>
                  <p className="text-muted-foreground">
                    Contains license plate information
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative">
                  <ImageWithFallback
                    src={image_1c4e085c3e80dd157767a201559cf19c03d90b95}
                    alt="After Processing"
                    className="w-full h-64 object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full">
                    After
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="font-semibold mb-2">Privacy Protected</h3>
                  <p className="text-muted-foreground">
                    License plates automatically blurred
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-secondary/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-primary mb-4">
              How It Works
            </h2>
            <p className="text-xl text-muted-foreground">
              Three simple steps to protect privacy in your images and videos
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-primary text-primary-foreground w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold mb-4">1. Upload</h3>
              <p className="text-muted-foreground">
                Upload your photos or videos securely. We support all major formats 
                including JPEG, PNG, MP4, and more.
              </p>
            </div>

            <div className="text-center">
              <div className="bg-primary text-primary-foreground w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Zap className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold mb-4">2. Process</h3>
              <p className="text-muted-foreground">
                Our AI automatically detects faces and license plates, applying 
                intelligent blur effects while preserving image quality.
              </p>
            </div>

            <div className="text-center">
              <div className="bg-primary text-primary-foreground w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Download className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold mb-4">3. Download</h3>
              <p className="text-muted-foreground">
                Download your privacy-protected files instantly. All processing 
                happens securely and your originals are never stored.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-primary mb-4">
              Why Choose PrivacyGuard?
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardContent className="p-6">
                <Eye className="w-12 h-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">Face Detection</h3>
                <p className="text-muted-foreground">
                  Advanced AI detects faces in any angle, lighting condition, or partial visibility.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <Car className="w-12 h-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">License Plates</h3>
                <p className="text-muted-foreground">
                  Automatically identifies and blurs license plates from any country or format.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <Shield className="w-12 h-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">Secure Processing</h3>
                <p className="text-muted-foreground">
                  All files are processed securely with end-to-end encryption and automatic deletion.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Shield className="h-8 w-8" />
                <span className="text-xl font-semibold">PrivacyGuard</span>
              </div>
              <p className="text-primary-foreground/80">
                Protecting privacy with AI-powered image and video censoring technology.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <div className="space-y-2">
                <div className="text-primary-foreground/80">Features</div>
                <div className="text-primary-foreground/80">Pricing</div>
                <div className="text-primary-foreground/80">API</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <div className="space-y-2">
                <div className="text-primary-foreground/80">Help Center</div>
                <div className="text-primary-foreground/80">Contact</div>
                <div className="text-primary-foreground/80">Privacy Policy</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <div className="space-y-2">
                <div className="text-primary-foreground/80">support@privacyguard.com</div>
                <div className="text-primary-foreground/80">+1 (555) 123-4567</div>
              </div>
            </div>
          </div>
          
          <div className="border-t border-primary-foreground/20 mt-8 pt-8 text-center text-primary-foreground/80">
            © 2025 PrivacyGuard. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}