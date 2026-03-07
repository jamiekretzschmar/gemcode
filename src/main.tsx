import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './Landing.tsx';
import App from './App.tsx';
import PowerShellApp from './PowerShellApp.tsx';
import './index.css';

const savedTheme = localStorage.getItem('gemcode_theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/classic" element={<App />} />
        <Route path="/powershell" element={<PowerShellApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
