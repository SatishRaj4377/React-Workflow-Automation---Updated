import React, { createContext, useState, useContext, useEffect } from 'react';
import { ThemeContext as ThemeContextType } from '../types';

/**
 * Create React Context for theme management.
 * This allows any component in the app to access the theme state and toggle function.
 */
const ThemeContext = createContext<ThemeContextType>({
  theme: 'light', // Default theme value.
  toggleTheme: () => {}, // Default empty function.
});

/**
 * Custom hook to easily use the theme context in any component.
 * This avoids having to import and call `useContext(ThemeContext)` everywhere.
 */
export const useTheme = () => useContext(ThemeContext);

/**
 * Props interface for the ThemeProvider component.
 * It expects `children` which are the components it will wrap.
 */
interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * The ThemeProvider component wraps the application and provides theme state.
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  
  /**
   * State to store the current theme ('light' or 'dark').
   * It initializes the state by checking localStorage for a previously saved theme.
   * If no theme is found in localStorage, it defaults to 'light'.
   */
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    // Return the saved theme if it's valid, otherwise default to 'light'.
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'light';
  });

  /**
   * Toggles the theme between 'light' and 'dark' and saves the choice.
   */
  const toggleTheme = () => {
    setTheme(prevTheme => {
      // Determine the next theme.
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      // Save the user's explicit choice to the browser's local storage.
      localStorage.setItem('theme', newTheme);
      // Update the state with the new theme.
      return newTheme;
    });
  };

  /**
   * Updates the stylesheet for Syncfusion EJ2 components to match the current theme.
   */
  const updateEJ2Theme = (currentTheme: 'light' | 'dark') => {
    // Find the link tag in the document head responsible for the theme.
    const cssLink = document.getElementById('css-link') as HTMLLinkElement | null;
    
    if (cssLink) {
      // Define the base URL for Syncfusion's CDN themes.
      const baseUrl = 'https://cdn.syncfusion.com/ej2/30.1.37/';
      // Set the appropriate theme file based on the current theme.
      cssLink.href = currentTheme === 'dark' 
        ? `${baseUrl}tailwind3-dark.css`
        : `${baseUrl}tailwind3.css`;
    }
  };

  /**
   * This effect runs every time the `theme` state changes.
   * It applies the theme to the entire application.
   */
  useEffect(() => {
    // Set a 'data-theme' attribute on the root <html> element for CSS styling.
    document.documentElement.setAttribute('data-theme', theme);
    // Update the Syncfusion components' theme to match.
    updateEJ2Theme(theme);
  }, [theme]); // The effect re-runs only when the 'theme' value changes.

  /**
   * Provide the theme state and the toggle function to all child components.
   * Any component inside <ThemeProvider> can now use the `useTheme()` hook.
   */
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Export the context as the default export.
export default ThemeContext;
