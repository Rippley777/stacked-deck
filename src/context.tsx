import { createContext, useContext } from 'react';
import type { User } from '../shared/types';
export const AppContext = createContext<{
  user: User;
  revision: number;
  refresh: () => void;
  notify: (message: string) => void;
  addItem: () => void;
  logout: () => void;
}>({
  user: { id: '', name: '', email: '' },
  revision: 0,
  refresh: () => {},
  notify: () => {},
  addItem: () => {},
  logout: () => {},
});
export const useApp = () => useContext(AppContext);
