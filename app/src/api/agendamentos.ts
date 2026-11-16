import { api } from "./client";
import { Agendamento } from "../types";

export interface SlotDisponibilidade {
  hora: string;
  disponivel: boolean;
}

export interface Disponibilidade {
  aberto: boolean;
  horarios: SlotDisponibilidade[];
}

export async function getDisponibilidade(lojaId: number, data: string): Promise<Disponibilidade> {
  return api.get<Disponibilidade>(`/api/lojas/${lojaId}/disponibilidade?data=${data}`);
}

export async function getMeusAgendamentos(token: string): Promise<Agendamento[]> {
  const data = await api.get<{ agendamentos: Agendamento[] }>("/api/agendamentos/me", token);
  return data.agendamentos;
}

export async function criarAgendamento(
  token: string,
  payload: { lojaId: number; servicoId: number; data: string; hora: string; veiculo?: string; notas?: string }
): Promise<Agendamento> {
  const data = await api.post<{ agendamento: Agendamento }>("/api/agendamentos", payload, token);
  return data.agendamento;
}

export async function cancelarAgendamento(token: string, id: number): Promise<void> {
  await api.put(`/api/agendamentos/${id}/cancelar`, {}, token);
}
