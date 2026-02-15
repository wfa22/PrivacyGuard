import React, { useState, useEffect } from 'react';
import { HomePage } from './components/HomePage';
import { AuthPage } from './components/AuthPage';
import { CensoringPage } from './components/CensoringPage';
import { DashboardPage } from './components/DashboardPage';
import { AdminPage } from './components/AdminPage';
import { Header } from './components/Header';
import { tokenStorage, api, User } from './utils/api';

type Page = 'home' | 'auth' | 'censoring' | 'dashboard' | 'admin';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = tokenStorage.getToken();
      if (token) {
        try {
          const currentUser = await api.getCurrentUser();
          setUser(currentUser);
          setIsLoggedIn(true);
        } catch (error) {
          tokenStorage.clear();
          setIsLoggedIn(false);
          setUser(null);
        }
      }
      setIsCheckingAuth(false);
    };

    checkAuth();
  }, []);

  const handleLogin = async (loggedIn: boolean) => {
    if (loggedIn) {
      try {
        const currentUser = await api.getCurrentUser();
        setUser(currentUser);
        setIsLoggedIn(true);
        setCurrentPage('censoring');
      } catch {
        setIsLoggedIn(false);
        setUser(null);
      }
    }
  };

  const handleLogout = () => {
    tokenStorage.clear();
    setIsLoggedIn(false);
    setUser(null);
    setCurrentPage('home');
  };

  const handleGetStarted = () => {
    if (isLoggedIn) {
      setCurrentPage('censoring');
    } else {
      setCurrentPage('auth');
    }
  };

  const handleNavigate = (page: Page) => {
    const protectedPages: Page[] = ['censoring', 'dashboard'];
    const adminPages: Page[] = ['admin'];

    // Гость → на логин
    if (protectedPages.includes(page) && !isLoggedIn) {
      setCurrentPage('auth');
      return;
    }

    // Не-админ пытается зайти в admin → на home
    if (adminPages.includes(page) && user?.role !== 'admin') {
      setCurrentPage('home');
      return;
    }

    setCurrentPage(page);
  };

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
        return <DashboardPage onNavigate={handleNavigate} user={user} />;
      case 'admin':
        if (user?.role !== 'admin') {
          return <HomePage onNavigate={handleNavigate} onGetStarted={handleGetStarted} />;
        }
        return <AdminPage onNavigate={handleNavigate} currentUser={user} />;
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
        user={user}
        onLogout={handleLogout}
      />
      {renderPage()}
    </div>
  );
}