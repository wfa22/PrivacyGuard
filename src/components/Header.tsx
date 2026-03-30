import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Shield, User as UserIcon, Settings } from 'lucide-react';
import { User } from '../utils/api';

interface HeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isLoggedIn: boolean;
  user: User | null;
  onLogout: () => void;
}

export function Header({ currentPage, onNavigate, isLoggedIn, user, onLogout }: HeaderProps) {
  const isAdmin = user?.role === 'admin';

  const navLinkClass = (page: string) =>
    `px-3 py-2 rounded-md transition-colors ${
      currentPage === page
        ? 'bg-primary text-primary-foreground'
        : 'text-foreground hover:text-primary'
    }`;

  return (
    <header className="bg-white border-b border-border" role="banner">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo — семантическая ссылка на главную */}
          <Link
            to="/"
            className="flex items-center space-x-2"
            aria-label="PrivacyGuard — go to homepage"
          >
            <Shield className="h-8 w-8 text-primary" aria-hidden="true" />
            <span className="text-xl font-semibold text-primary">PrivacyGuard</span>
          </Link>

          {/* Навигация — семантический <nav> */}
          <nav className="hidden md:flex space-x-8" aria-label="Main navigation">
            <Link to="/" className={navLinkClass('home')}>
              Home
            </Link>
            <Link to="/censoring" className={navLinkClass('censoring')}>
              Upload &amp; Censor
            </Link>
            {isLoggedIn && (
              <Link to="/dashboard" className={navLinkClass('dashboard')}>
                Dashboard
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                className={`${navLinkClass('admin')} flex items-center gap-1`}
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
                Admin
              </Link>
            )}
          </nav>

          {/* User actions */}
          <div className="flex items-center space-x-4">
            {isLoggedIn ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <UserIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium hidden sm:inline">
                    {user?.username}
                  </span>
                  <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-xs">
                    {user?.role}
                  </Badge>
                </div>
                <Button variant="outline" onClick={onLogout}>
                  Logout
                </Button>
              </div>
            ) : (
              <Button onClick={() => onNavigate('auth')} asChild>
                <Link to="/auth">Login</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}