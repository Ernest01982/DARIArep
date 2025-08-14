import React, { createContext, useContext, useState, useEffect } from 'react';
import { REP_ID } from '../config';

interface Rep {
  id: string;
  name: string;
  surname: string;
  email?: string;
  region?: string;
}

interface AuthContextType {
  currentRep: Rep | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentRep, setCurrentRep] = useState<Rep | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // For now, we'll use a mock rep based on the REP_ID from config
    // In a real app, this would fetch from Supabase or another auth provider
    const mockRep: Rep = {
      id: REP_ID,
      name: 'John',
      surname: 'Doe',
      email: 'john.doe@company.com',
      region: 'Western Cape'
    };

    setCurrentRep(mockRep);
    setIsLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ currentRep, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}