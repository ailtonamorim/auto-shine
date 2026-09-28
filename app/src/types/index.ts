export interface Servico {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  duracao: string;
}

export interface Avaliacao {
  id: number;
  nota: number;
  comentario?: string;
  usuario?: { nome: string };
  createdAt: string;
}

export interface Loja {
  id: number;
  nome: string;
  descricao: string;
  endereco: string;
  fotoUrl: string;
  capaUrl?: string;
  categoria: string;
  precoMedio: number;
  latitude: number;
  longitude: number;
  formasPagamento: string;
  agendaDias: string;
  agendaHorarios: string;
  servicos: Servico[];
  avaliacoes: Avaliacao[];
  isFavorited?: boolean;
}

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  telefone?: string;
  fotoUrl?: string;
}

export interface Agendamento {
  id: number;
  data: string;
  hora: string;
  status: "pendente" | "confirmado" | "concluido" | "cancelado";
  loja: Pick<Loja, "id" | "nome" | "fotoUrl" | "endereco">;
  servico: Pick<Servico, "id" | "nome" | "preco" | "duracao">;
}
