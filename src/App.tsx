import React, { useState } from 'react';
import { HomePage } from './components/HomePage';
import { AuthPage } from './components/AuthPage';
import { CensoringPage } from './components/CensoringPage';
import { DashboardPage } from './components/DashboardPage';
import { Header } from './components/Header';

type Page = 'home' | 'auth' | 'censoring' | 'dashboard';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLogin = (loggedIn: boolean) => {
    setIsLoggedIn(loggedIn);
    if (loggedIn) {
      setCurrentPage('censoring'); // Auto-redirect to censoring page after login
    }
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
        onLogout={() => setIsLoggedIn(false)}
      />
      {renderPage()}
    </div>
  );
}