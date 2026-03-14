import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F0F9F5',
        color: '#3dbaaa',
        fontSize: 18,
        fontWeight: 700,
      }}>
        Загрузка...
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
