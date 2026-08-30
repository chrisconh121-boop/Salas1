import React, { createContext, useContext } from 'react';

interface LanguageContextValue {
  lang: string;
}

const LanguageContext = createContext<LanguageContextValue>({ lang: 'es' });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  return (
    <LanguageContext.Provider value={{ lang: 'es' }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
