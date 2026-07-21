import React, { useEffect } from 'react';
import { ThemeProvider as StyledThemeProvider } from 'styled-components';
import * as design from '../design';

// Create a unified theme object for styled-components
export const theme = {
  colors: design.colors,
  spacing: design.spacing,
  typography: design.typography,
  radius: design.radius,
  shadows: design.shadows,
  breakpoints: design.breakpoints,
  zIndex: design.zIndex,
  animations: design.animations,
};

/**
 * ThemeProvider injects CSS variables into :root for light/dark theming
 * and also provides a styled-components ThemeProvider.
 */
const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const root = document.documentElement;
    // Colors
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value as string);
    });
    // Spacing (index based)
    theme.spacing.forEach((value, index) => {
      root.style.setProperty(`--spacing-${index}`, `${value}px`);
    });
    // Radius
    Object.entries(theme.radius).forEach(([key, value]) => {
      root.style.setProperty(`--radius-${key}`, value as string);
    });
    // Shadows
    Object.entries(theme.shadows).forEach(([key, value]) => {
      root.style.setProperty(`--shadow-${key}`, value as string);
    });
    // Breakpoints
    Object.entries(theme.breakpoints).forEach(([key, value]) => {
      root.style.setProperty(`--breakpoint-${key}`, value as string);
    });
    // Z-index
    Object.entries(theme.zIndex).forEach(([key, value]) => {
      root.style.setProperty(`--zindex-${key}`, `${value}`);
    });
    // Animations (just store the animation rule)
    Object.entries(theme.animations).forEach(([key, value]) => {
      root.style.setProperty(`--animation-${key}`, value as string);
    });
  }, []);

  return <StyledThemeProvider theme={theme}>{children}</StyledThemeProvider>;
};

export default ThemeProvider;
