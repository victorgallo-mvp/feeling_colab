import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../lib/auth';
import { ToastProvider } from '../components/ui/toast';
import { Layout } from './Layout';
import { HomePage } from './pages/Home';
import { AuthCallbackPage, LoginPage } from './pages/Login';
import { AdminPage } from './pages/Admin';
import { Spinner } from '../components/ui';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } });

function Private({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { authed, me, loading } = useAuth();
  const loc = useLocation();
  if (!authed) return <Navigate to="/entrar" replace state={{ from: loc }} />;
  if (loading || !me) return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6 text-fg-faint" /></div>;
  if (admin && me.user.role !== 'admin') return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/entrar" element={<LoginPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/" element={<Private><HomePage /></Private>} />
              <Route path="/admin" element={<Private admin><AdminPage /></Private>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
