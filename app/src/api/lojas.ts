import { api } from "./client";
import { Loja } from "../types";

export async function getLojas(token?: string): Promise<Loja[]> {
  const data = await api.get<{ lojas: Loja[] }>("/api/lojas", token);
  return data.lojas;
}

export async function getLoja(id: number, token?: string): Promise<Loja> {
  const data = await api.get<{ loja: Loja }>(`/api/lojas/${id}`, token);
  return data.loja;
}
