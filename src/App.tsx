import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import DictionaryPage from './pages/DictionaryPage';
import GamesPage from './pages/GamesPage';
import CardsPage from './pages/CardsPage';
import PairsPage from './pages/PairsPage';
import QuizPage from './pages/QuizPage';
import ReviewPage from './pages/ReviewPage';
import ProfilePage from './pages/ProfilePage';
import EditProfilePage from './pages/EditProfilePage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/home" element={
            <ProtectedRoute>
              <AppLayout><HomePage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/dictionary" element={
            <ProtectedRoute>
              <AppLayout><DictionaryPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/games" element={
            <ProtectedRoute>
              <AppLayout><GamesPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/cards" element={
            <ProtectedRoute>
              <AppLayout><CardsPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/pairs" element={
            <ProtectedRoute>
              <AppLayout><PairsPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/quiz" element={
            <ProtectedRoute>
              <AppLayout><QuizPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/review" element={
            <ProtectedRoute>
              <AppLayout><ReviewPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <AppLayout><ProfilePage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/profile/edit" element={
            <ProtectedRoute>
              <AppLayout><EditProfilePage /></AppLayout>
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
