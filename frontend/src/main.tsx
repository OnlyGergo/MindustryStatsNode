import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { getRouter } from './router';
import './index.css';

const router = getRouter();

hydrateRoot(
  document.getElementById('root')!,
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
