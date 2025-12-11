import React, { useState, useEffect } from 'react';
import { HomePage } from './components/HomePage';
import { AuthPage } from './components/AuthPage';
import { CensoringPage } from './components/CensoringPage';
import { DashboardPage } from './components/DashboardPage';
import { Header } from './components/Header';
import { tokenStorage, api } from './utils/api';

type Page = 'home' | 'auth' | 'censoring' | 'dashboard';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = tokenStorage.getToken();
      if (token) {
        try {
          // Verify token is valid by getting current user
          await api.getCurrentUser();
          setIsLoggedIn(true);
        } catch (error) {
          // Token is invalid, clear it
          tokenStorage.clear();
          setIsLoggedIn(false);
        }
      }
      setIsCheckingAuth(false);
    };

    checkAuth();
  }, []);

  const handleLogin = (loggedIn: boolean) => {
    setIsLoggedIn(loggedIn);
    if (loggedIn) {
      setCurrentPage('censoring'); // Auto-redirect to censoring page after login
    }
  };

  const handleLogout = () => {
    tokenStorage.clear();
    setIsLoggedIn(false);
    setCurrentPage('home');
  };

  const handleGetStarted = () => {
    if (isLoggedIn) {
      setCurrentPage('censoring');
    } else {
      setCurrentPage('auth');
    }
  };

  // Protected navigation - redirects to auth if trying to access protected pages while not logged in
  const handleNavigate = (page: Page) => {
    const protectedPages: Page[] = ['censoring', 'dashboard'];
    
    if (protectedPages.includes(page) && !isLoggedIn) {
      setCurrentPage('auth');
    } else {
      setCurrentPage(page);
    }
  };

  // Show loading state while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} onGetStarted={handleGetStarted} />;
      case 'auth':
        return <AuthPage onNavigate={handleNavigate} onLogin={handleLogin} />;
      case 'censoring':
        return <CensoringPage onNavigate={handleNavigate} />;
      case 'dashboard':
        return <DashboardPage onNavigate={handleNavigate} />;
      default:
        return <HomePage onNavigate={handleNavigate} onGetStarted={handleGetStarted} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header 
        currentPage={currentPage} 
        onNavigate={handleNavigate} 
        isLoggedIn={isLoggedIn}
        onLogout={handleLogout}
      />
      {renderPage()}
    </div>
  );
}