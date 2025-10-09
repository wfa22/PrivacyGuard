import React from 'react';
import { Button } from './ui/button';
import { Shield, User } from 'lucide-react';

interface HeaderProps {
  currentPage: string;
  onNavigate: (page: any) => void;
  isLoggedIn: boolean;
  onLogout: () => void;
}

export function Header({ currentPage, onNavigate, isLoggedIn, onLogout }: HeaderProps) {
  return (
    <header className="bg-white border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <div 
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => onNavigate('home')}
            >
              <Shield className="h-8 w-8 text-primary" />
              <span className="text-xl font-semibold text-primary">PrivacyGuard</span>
            </div>
          </div>
          
          <nav className="hidden md:flex space-x-8">
            <button
              onClick={() => onNavigate('home')}
              className={`px-3 py-2 rounded-md transition-colors ${
                currentPage === 'home' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-foreground hover:text-primary'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => onNavigate('censoring')}
              className={`px-3 py-2 rounded-md transition-colors ${
                currentPage === 'censoring' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-foreground hover:text-primary'
              }`}
            >
              Upload & Censor
            </button>
            {isLoggedIn && (
              <button
                onClick={() => onNavigate('dashboard')}
                className={`px-3 py-2 rounded-md transition-colors ${
                  currentPage === 'dashboard' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'text-foreground hover:text-primary'
                }`}
              >
                Dashboard
              </button>
            )}
          </nav>

          <div className="flex items-center space-x-4">
            {isLoggedIn ? (
              <div className="flex items-center space-x-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <Button variant="outline" onClick={onLogout}>
                  Logout
                </Button>
              </div>
            ) : (
              <Button onClick={() => onNavigate('auth')}>
                Login
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}