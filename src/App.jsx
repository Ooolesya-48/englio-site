// App.jsx
import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import SetEditor from './components/setEditor/SetEditor';
import TrainersPage from './pages/TrainersPage';
import SetsPage from './pages/SetsPage';
import SchoolPage from './pages/SchoolPage';
import BlogPage from './pages/BlogPage';

export default function App() {
  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={<SetEditor />} />
          <Route path="/trainers" element={<TrainersPage />} />
          <Route path="/sets" element={<SetsPage />} />
          <Route path="/school" element={<SchoolPage />} />
          <Route path="/blog" element={<BlogPage />} />
        </Routes>
      </main>
    </>
  );
}
