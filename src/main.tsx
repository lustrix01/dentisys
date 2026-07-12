import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import ThemeProvider from './theme/ThemeProvider';
import { AttendanceProvider } from './contexts/AttendanceContext';
import { FacialEnrollmentProvider } from './contexts/FacialEnrollmentContext';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AttendanceProvider>
        <FacialEnrollmentProvider>
          <ThemeProvider>
            <App />
            <Toaster position="top-right" />
          </ThemeProvider>
        </FacialEnrollmentProvider>
      </AttendanceProvider>
    </AuthProvider>
  </StrictMode>
);