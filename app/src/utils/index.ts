export function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(data: string): string {
  return new Date(data).toLocaleDateString("pt-BR");
}

export function formatarNota(nota: number): string {
  return nota.toFixed(1);
}

export function calcularMediaAvaliacoes(avaliacoes: { nota: number }[]): number {
  if (!avaliacoes.length) return 0;
  return avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length;
}
