import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Usuario } from "../types";

interface AuthState {
  token: string | null;
  usuario: Usuario | null;
  carregando: boolean;
}

interface AuthContextData extends AuthState {
  login: (token: string, usuario: Usuario) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

const TOKEN_KEY = "@autoshine:token";
const USUARIO_KEY = "@autoshine:usuario";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<AuthState>({
    token: null,
    usuario: null,
    carregando: true,
  });

  useEffect(() => {
    async function carregar() {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const usuarioJson = await AsyncStorage.getItem(USUARIO_KEY);
        if (token && usuarioJson) {
          setEstado({ token, usuario: JSON.parse(usuarioJson), carregando: false });
        } else {
          setEstado((prev) => ({ ...prev, carregando: false }));
        }
      } catch {
        setEstado((prev) => ({ ...prev, carregando: false }));
      }
    }
    carregar();
  }, []);

  async function login(token: string, usuario: Usuario) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
    setEstado({ token, usuario, carregando: false });
  }

  async function logout() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USUARIO_KEY);
    setEstado({ token: null, usuario: null, carregando: false });
  }

  return (
    <AuthContext.Provider value={{ ...estado, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
