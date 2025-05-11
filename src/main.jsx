import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import Collections from './Collections.jsx'; // новый компонент
import CollectionView from './CollectionView.jsx';
import WordsTable from './WordsTable.jsx'; // <-- Обязательно!
import './styles.css'; // или './style.css', если файл называется иначе
import MatchGame from "./MatchGame"; // вверху файла



ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:id" element={<CollectionView />} />
        <Route path="/collections/:id/:subid" element={<WordsTable />} />
        <Route path="/match" element={<MatchGame />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);


