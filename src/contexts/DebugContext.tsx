import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface DebugContextType {
  debugMode: boolean;
  toggleDebug: () => void;
}

const DebugContext = createContext<DebugContextType>({ debugMode: false, toggleDebug: () => {} });

export const useDebug = () => useContext(DebugContext);

export const DebugProvider = ({ children }: { children: ReactNode }) => {
  const [debugMode, setDebugMode] = useState(() => {
    return localStorage.getItem("debug_mode") === "true";
  });

  useEffect(() => {
    localStorage.setItem("debug_mode", String(debugMode));
  }, [debugMode]);

  const toggleDebug = () => setDebugMode((v) => !v);

  return (
    <DebugContext.Provider value={{ debugMode, toggleDebug }}>
      {children}
    </DebugContext.Provider>
  );
};

export default DebugProvider;
