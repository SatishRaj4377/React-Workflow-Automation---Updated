import React, { createContext, useState, useContext, useEffect } from 'react';
import { ThemeContext as ThemeContextType } from '../types';

// Theme context shared across the app
const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

// Hook to access theme and toggler
export const useTheme = () => useContext(ThemeContext);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Load initial theme from localStorage (defaults to 'light')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'light';
  });

  // Toggle theme and persist to localStorage
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      return next;
    });
  };

  // Update Syncfusion EJ2 stylesheet to match current theme
  const updateEJ2Theme = (current: 'light' | 'dark') => {
    const cssLink = document.getElementById('theme-link') as HTMLLinkElement | null;
    if (cssLink) {
      const baseUrl = 'https://cdn.syncfusion.com/ej2/30.1.37/';
      cssLink.href = current === 'dark' ? `${baseUrl}tailwind3-dark.css` : `${baseUrl}tailwind3.css`;
    }
  };

  // Apply theme attribute and update EJ2 when theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    updateEJ2Theme(theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

export default ThemeContext;
