import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ListenerPage from './pages/ListenerPage';
import AdminPage from './pages/AdminPage';
import './styles.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ListenerPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
