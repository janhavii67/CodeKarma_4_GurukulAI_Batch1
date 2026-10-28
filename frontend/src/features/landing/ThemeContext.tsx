import React, { createContext, useContext, useEffect, useState } from 'react';
import { getInitialTheme, applyTheme, Theme } from './theme';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  animationsPaused: boolean;
  toggleAnimations: () => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: 'light',
  toggle: () => {},
  animationsPaused: false,
  toggleAnimations: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [animationsPaused, setAnimationsPaused] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));
  const toggleAnimations = () => setAnimationsPaused(p => !p);

  return <Ctx.Provider value={{ theme, toggle, animationsPaused, toggleAnimations }}>{children}</Ctx.Provider>;
};

export const useTheme = () => useContext(Ctx);

