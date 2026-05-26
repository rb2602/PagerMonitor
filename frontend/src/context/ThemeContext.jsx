import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() =>
    // migrate old key → new key transparently
    localStorage.getItem('pagermonitor-theme') ||
    localStorage.getItem('pagemon-theme') ||
    'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pagermonitor-theme', theme);
    localStorage.removeItem('pagemon-theme'); // clean up old key

    // Keep the browser toolbar colour in sync with the header background so it
    // blends seamlessly instead of the green default popping when the toolbar
    // auto-hides/shows on scroll (especially noticeable in dark theme).
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        theme === 'dark' ? '#161b22' : '#ffffff'   // --bg-1 for each theme
      );
    }
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
