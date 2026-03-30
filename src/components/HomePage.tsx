import image_1c4e085c3e80dd157767a201559cf19c03d90b95 from 'figma:asset/1c4e085c3e80dd157767a201559cf19c03d90b95.png';
import image_709588cac4b001de1885bc6f3067749a346e8958 from 'figma:asset/709588cac4b001de1885bc6f3067749a346e8958.png';
import React from 'react';
import {Link} from 'react-router-dom';
import {Button} from './ui/button';
import {Card, CardContent} from './ui/card';
import {ImageWithFallback} from './figma/ImageWithFallback';
import {SEOHead} from './SEOHead';
import {Shield, Upload, Zap, Download, Eye, Car} from 'lucide-react';

interface HomePageProps {
    onNavigate: (page: string) => void;
    onGetStarted: () => void;
}

export function HomePage({onNavigate, onGetStarted}: HomePageProps) {
    const handleViewDemo = () => {
        const element = document.getElementById('see-the-difference');
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }
    };

    // Structured Data — Organization + WebApplication (JSON-LD)
    const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "name": "PrivacyGuard",
                "url": "https://privacyguard.com",
                "logo": "https://privacyguard.com/og-image.png",
                "description": "AI-powered privacy protection service for images and videos.",
                "contactPoint": {
                    "@type": "ContactPoint",
                    "email": "support@privacyguard.com",
                    "contactType": "customer support"
                }
            },
            {
                "@type": "WebApplication",
                "name": "PrivacyGuard",
                "url": "https://privacyguard.com",
                "applicationCategory": "MultimediaApplication",
                "operatingSystem": "Web",
                "description": "Automatically blur faces and license plates in photos and videos using AI.",
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD"
                },
                "featureList": [
                    "AI face detection and blurring",
                    "License plate detection and blurring",
                    "Batch image processing",
                    "Video processing",
                    "GDPR compliance"
                ]
            },
            {
                "@type": "HowTo",
                "name": "How to blur faces and license plates with PrivacyGuard",
                "description": "Three simple steps to protect privacy in your images and videos.",
                "step": [
                    {
                        "@type": "HowToStep",
                        "position": 1,
                        "name": "Upload",
                        "text": "Upload your photos or videos securely. We support JPEG, PNG, MP4, and more."
                    },
                    {
                        "@type": "HowToStep",
                        "position": 2,
                        "name": "Process",
                        "text": "Our AI automatically detects faces and license plates, applying intelligent blur effects."
                    },
                    {
                        "@type": "HowToStep",
                        "position": 3,
                        "name": "Download",
                        "text": "Download your privacy-protected files instantly."
                    }
                ]
            }
        ]
    };

    return (
        <>
            <SEOHead
                title="PrivacyGuard — AI-Powered Face & License Plate Blurring"
                description="Automatically blur faces and license plates in photos and videos with AI. Free, fast, GDPR-compliant privacy protection for your media files."
                path="/"
            />

            {/* JSON-LD Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{__html: JSON.stringify(structuredData)}}
            />

            <main className="min-h-screen">
                {/* Hero Section */}
                <section
                    className="bg-gradient-to-br from-primary/5 to-secondary/10 py-20"
                    aria-labelledby="hero-heading"
                >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            <div>
                                <h1
                                    id="hero-heading"
                                    className="text-4xl lg:text-6xl font-bold text-primary mb-6"
                                >
                                    Protect Privacy
                                    <br/>
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
                                    src="https://images.unsplash.com/photo-1639503547276-90230c4a4198?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXRhJTIwcHJpdmFjeSUyMHNlY3VyaXR5JTIwc2hpZWxkfGVufDF8fHx8MTc1ODI4NzQ5Nnww&ixlib=rb-4.1.0&q=80&w=1080"
                                    alt="Digital privacy shield protecting personal data — PrivacyGuard concept illustration"
                                    className="rounded-2xl shadow-2xl w-full"
                                    loading="eager"
                                    // 4.4: width/height предотвращают Layout Shift при загрузке изображения
                                    width={1080}
                                    height={720}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Before/After Examples */}
                <section
                    className="py-20 bg-white"
                    aria-labelledby="see-the-difference"
                >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h2
                                id="see-the-difference"
                                className="text-3xl lg:text-4xl font-bold text-primary mb-4"
                            >
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
                                            alt="Street photo with visible license plate before privacy processing by PrivacyGuard"
                                            className="w-full h-64 object-cover"
                                            loading="lazy"
                                        />
                                        <div
                                            className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                                            Before
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <h3 className="font-semibold mb-2">Original Image</h3>
                                        <p className="text-muted-foreground">
                                            Contains visible license plate information that may violate privacy
                                            regulations.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="overflow-hidden">
                                <CardContent className="p-0">
                                    <div className="relative">
                                        <ImageWithFallback
                                            src={image_1c4e085c3e80dd157767a201559cf19c03d90b95}
                                            alt="Same street photo with license plate automatically blurred by PrivacyGuard AI"
                                            className="w-full h-64 object-cover"
                                            loading="lazy"
                                        />
                                        <div
                                            className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                                            After
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <h3 className="font-semibold mb-2">Privacy Protected</h3>
                                        <p className="text-muted-foreground">
                                            License plates automatically detected and blurred while preserving image
                                            quality.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </section>

                {/* How It Works */}
                <section
                    className="py-20 bg-secondary/10"
                    aria-labelledby="how-it-works-heading"
                >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h2
                                id="how-it-works-heading"
                                className="text-3xl lg:text-4xl font-bold text-primary mb-4"
                            >
                                How It Works
                            </h2>
                            <p className="text-xl text-muted-foreground">
                                Three simple steps to protect privacy in your images and videos
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-8">
                            <article className="text-center">
                                <div
                                    className="bg-primary text-primary-foreground w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                                    aria-hidden="true"
                                >
                                    <Upload className="w-8 h-8"/>
                                </div>
                                <h3 className="text-xl font-semibold mb-4">1. Upload</h3>
                                <p className="text-muted-foreground">
                                    Upload your photos or videos securely. We support all major formats
                                    including JPEG, PNG, MP4, and more.
                                </p>
                            </article>

                            <article className="text-center">
                                <div
                                    className="bg-primary text-primary-foreground w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                                    aria-hidden="true"
                                >
                                    <Zap className="w-8 h-8"/>
                                </div>
                                <h3 className="text-xl font-semibold mb-4">2. Process</h3>
                                <p className="text-muted-foreground">
                                    Our AI automatically detects faces and license plates, applying
                                    intelligent blur effects while preserving image quality.
                                </p>
                            </article>

                            <article className="text-center">
                                <div
                                    className="bg-primary text-primary-foreground w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                                    aria-hidden="true"
                                >
                                    <Download className="w-8 h-8"/>
                                </div>
                                <h3 className="text-xl font-semibold mb-4">3. Download</h3>
                                <p className="text-muted-foreground">
                                    Download your privacy-protected files instantly. All processing
                                    happens securely and your originals are never stored.
                                </p>
                            </article>
                        </div>
                    </div>
                </section>

                {/* Features */}
                <section
                    className="py-20 bg-white"
                    aria-labelledby="features-heading"
                >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h2
                                id="features-heading"
                                className="text-3xl lg:text-4xl font-bold text-primary mb-4"
                            >
                                Why Choose PrivacyGuard?
                            </h2>
                        </div>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            <Card>
                                <CardContent className="p-6">
                                    <Eye className="w-12 h-12 text-primary mb-4" aria-hidden="true"/>
                                    <h3 className="text-xl font-semibold mb-3">Face Detection</h3>
                                    <p className="text-muted-foreground">
                                        Advanced AI detects faces in any angle, lighting condition, or partial
                                        visibility.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-6">
                                    <Car className="w-12 h-12 text-primary mb-4" aria-hidden="true"/>
                                    <h3 className="text-xl font-semibold mb-3">License Plates</h3>
                                    <p className="text-muted-foreground">
                                        Automatically identifies and blurs license plates from any country or format.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-6">
                                    <Shield className="w-12 h-12 text-primary mb-4" aria-hidden="true"/>
                                    <h3 className="text-xl font-semibold mb-3">Secure Processing</h3>
                                    <p className="text-muted-foreground">
                                        All files are processed securely with end-to-end encryption and automatic
                                        deletion.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer className="bg-primary text-primary-foreground py-12" role="contentinfo">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid md:grid-cols-4 gap-8">
                            <div>
                                <div className="flex items-center space-x-2 mb-4">
                                    <Shield className="h-8 w-8" aria-hidden="true"/>
                                    <span className="text-xl font-semibold">PrivacyGuard</span>
                                </div>
                                <p className="text-primary-foreground/80">
                                    Protecting privacy with AI-powered image and video censoring technology.
                                </p>
                            </div>

                            <nav aria-label="Product links">
                                <h4 className="font-semibold mb-4">Product</h4>
                                <ul className="space-y-2">
                                    <li>
                                        <Link to="/#features-heading"
                                              className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                                            Features
                                        </Link>
                                    </li>
                                    <li>
                                        <span className="text-primary-foreground/80">Pricing</span>
                                    </li>
                                    <li>
                                        <span className="text-primary-foreground/80">API</span>
                                    </li>
                                </ul>
                            </nav>

                            <nav aria-label="Support links">
                                <h4 className="font-semibold mb-4">Support</h4>
                                <ul className="space-y-2">
                                    <li>
                                        <span className="text-primary-foreground/80">Help Center</span>
                                    </li>
                                    <li>
                                        <span className="text-primary-foreground/80">Contact</span>
                                    </li>
                                    <li>
                                        <span className="text-primary-foreground/80">Privacy Policy</span>
                                    </li>
                                </ul>
                            </nav>

                            <div>
                                <h4 className="font-semibold mb-4">Contact</h4>
                                <address className="not-italic space-y-2">
                                    <p className="text-primary-foreground/80">
                                        <a href="mailto:support@privacyguard.com"
                                           className="hover:text-primary-foreground transition-colors">
                                            support@privacyguard.com
                                        </a>
                                    </p>
                                    <p className="text-primary-foreground/80">
                                        <a href="tel:+15551234567"
                                           className="hover:text-primary-foreground transition-colors">
                                            +1 (555) 123-4567
                                        </a>
                                    </p>
                                </address>
                            </div>
                        </div>

                        <div
                            className="border-t border-primary-foreground/20 mt-8 pt-8 text-center text-primary-foreground/80">
                            <p>© {new Date().getFullYear()} PrivacyGuard. All rights reserved.</p>
                        </div>
                    </div>
                </footer>
            </main>
        </>
    );
}