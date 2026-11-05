import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MapCanvas } from './map/MapCanvas.tsx';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MapCanvas />
  </StrictMode>,
);
