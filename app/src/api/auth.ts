import { api } from "./client";
import { Usuario } from "../types";

interface LoginResponse {
  token: string;
  usuario: Usuario;
}

interface SignupResponse {
  token: string;
  usuario: Usuario;
}

export async function login(email: string, senha: string): Promise<LoginResponse> {
  return api.post<LoginResponse>("/api/auth/login", { email, senha });
}

export async function signup(
  nome: string,
  email: string,
  senha: string,
  telefone?: string
): Promise<SignupResponse> {
  return api.post<SignupResponse>("/api/auth/signup", { nome, email, senha, telefone });
}

export async function getMe(token: string): Promise<Usuario> {
  const data = await api.get<{ usuario: Usuario }>("/api/auth/me", token);
  return data.usuario;
}
