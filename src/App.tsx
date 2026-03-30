import React, { useState, useEffect, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { tokenStorage, api, User } from './utils/api';

// ═══════════════════════════════════════════════════════════════
// 4.1. LAZY LOADING тяжёлых компонентов
// ═══════════════════════════════════════════════════════════════
// WHY: Без lazy loading весь код (AdminPage, DashboardPage,
// CensoringPage с motion/framer, recharts и т.д.) попадает
// в один бандл ~300-500KB. С lazy — главная загружается за ~80KB,
// остальное подгружается по требованию.
//
// HomePage НЕ lazy — это landing, критичен для First Contentful Paint.
// Header НЕ lazy — виден на каждой странице.
// ═══════════════════════════════════════════════════════════════

import { HomePage } from './components/HomePage';

const AuthPage = React.lazy(() =>
  import('./components/AuthPage').then(m => ({ default: m.AuthPage }))
);
const CensoringPage = React.lazy(() =>
  import('./components/CensoringPage').then(m => ({ default: m.CensoringPage }))
);
const DashboardPage = React.lazy(() =>
  import('./components/DashboardPage').then(m => ({ default: m.DashboardPage }))
);
const AdminPage = React.lazy(() =>
  import('./components/AdminPage').then(m => ({ default: m.AdminPage }))
);

// ═══════════════════════════════════════════════════════════════
// 4.4. Стабильный loading fallback с фиксированными размерами
// ═══════════════════════════════════════════════════════════════
// WHY: Без фиксированного размера при загрузке chunk'а контент
// "прыгает" (Layout Shift). min-h-screen гарантирует, что
// placeholder занимает то же пространство, что и итоговый контент.
// Это влияет на метрику CLS (Cumulative Layout Shift).
// ═══════════════════════════════════════════════════════════════

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({
  isLoggedIn,
  isCheckingAuth,
  children,
}: {
  isLoggedIn: boolean;
  isCheckingAuth: boolean;
  children: React.ReactNode;
}) {
  if (isCheckingAuth) return <PageLoader />;
  if (!isLoggedIn) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AdminRoute({
  isLoggedIn,
  isCheckingAuth,
  user,
  children,
}: {
  isLoggedIn: boolean;
  isCheckingAuth: boolean;
  user: User | null;
  children: React.ReactNode;
}) {
  if (isCheckingAuth) return <PageLoader />;
  if (!isLoggedIn) return <Navigate to="/auth" replace />;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.onForceLogout = () => {
      setIsLoggedIn(false);
      setUser(null);
      navigate('/auth', { replace: true });
    };
    return () => { api.onForceLogout = null; };
  }, [navigate]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = tokenStorage.getToken();
      if (token) {
        try {
          const currentUser = await api.getCurrentUser();
          setUser(currentUser);
          setIsLoggedIn(true);
        } catch {
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
        navigate('/censoring');
      } catch {
        setIsLoggedIn(false);
        setUser(null);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      tokenStorage.clear();
    }
    setIsLoggedIn(false);
    setUser(null);
    navigate('/');
  };

  const handleGetStarted = () => {
    navigate(isLoggedIn ? '/censoring' : '/auth');
  };

  const handleNavigate = (page: string) => {
    const routeMap: Record<string, string> = {
      home: '/',
      auth: '/auth',
      censoring: '/censoring',
      dashboard: '/dashboard',
      admin: '/admin',
    };
    navigate(routeMap[page] || '/');
  };

  const currentPage = (() => {
    switch (location.pathname) {
      case '/': return 'home';
      case '/auth': return 'auth';
      case '/censoring': return 'censoring';
      case '/dashboard': return 'dashboard';
      case '/admin': return 'admin';
      default: return 'home';
    }
  })();

  if (isCheckingAuth) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background">
      <Header
        currentPage={currentPage}
        onNavigate={handleNavigate}
        isLoggedIn={isLoggedIn}
        user={user}
        onLogout={handleLogout}
      />

      {/* 4.1: Suspense оборачивает lazy-компоненты */}
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/"
            element={<HomePage onNavigate={handleNavigate} onGetStarted={handleGetStarted} />}
          />
          <Route
            path="/auth"
            element={
              isLoggedIn
                ? <Navigate to="/censoring" replace />
                : <AuthPage onNavigate={handleNavigate} onLogin={handleLogin} />
            }
          />
          <Route
            path="/censoring"
            element={
              <ProtectedRoute isLoggedIn={isLoggedIn} isCheckingAuth={isCheckingAuth}>
                <CensoringPage onNavigate={handleNavigate} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute isLoggedIn={isLoggedIn} isCheckingAuth={isCheckingAuth}>
                <DashboardPage onNavigate={handleNavigate} user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute isLoggedIn={isLoggedIn} isCheckingAuth={isCheckingAuth} user={user}>
                <AdminPage onNavigate={handleNavigate} currentUser={user} />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}