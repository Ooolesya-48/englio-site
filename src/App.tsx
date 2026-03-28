import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import { enrichAllWordMeanings } from './lib/generate-content';

// Фоновое обогащение словаря — запускается при логине, не останавливается при навигации
function BackgroundEnrich() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    // Запускаем тихо, не блокируем UI
    enrichAllWordMeanings();
  }, [user?.id]);
  return null;
}
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
import FillGapPage from './pages/FillGapPage';
import DefinitionPairsPage from './pages/DefinitionPairsPage';
import MatchingPage from './pages/MatchingPage';
import CollectionsPage from './pages/CollectionsPage';
import MyCollectionsPage from './pages/MyCollectionsPage';
import SubCollectionsPage from './pages/SubCollectionsPage';
import CreateCollectionPage from './pages/CreateCollectionPage';
import PublicCollectionPage from './pages/PublicCollectionPage';
import LandingPage from './pages/LandingPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BackgroundEnrich />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/home" element={
            <ProtectedRoute>
              <AppLayout><HomePage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/dictionary" element={
            <ProtectedRoute>
              <AppLayout hideNav><DictionaryPage /></AppLayout>
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
          <Route path="/fill-gap" element={
            <ProtectedRoute>
              <AppLayout><FillGapPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/collections" element={
            <ProtectedRoute>
              <AppLayout><CollectionsPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/my-collections" element={
            <ProtectedRoute>
              <AppLayout hideNav><MyCollectionsPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/my-collections/:id" element={
            <ProtectedRoute>
              <AppLayout hideNav><SubCollectionsPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/definition-pairs" element={
            <ProtectedRoute>
              <AppLayout><DefinitionPairsPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/matching" element={
            <ProtectedRoute>
              <AppLayout><MatchingPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/collections/create" element={
            <ProtectedRoute>
              <AppLayout hideNav><CreateCollectionPage /></AppLayout>
            </ProtectedRoute>
          } />
          {/* Публичная страница подборки — без авторизации, для SEO */}
          <Route path="/collections/:id" element={<PublicCollectionPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
