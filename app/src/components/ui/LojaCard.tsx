import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Loja } from "../../types";
import { formatarPreco, calcularMediaAvaliacoes, formatarNota } from "../../utils";
import { COLORS, SPACING, RADIUS } from "../../constants";

interface Props {
  loja: Loja;
  onPress: () => void;
}

export default function LojaCard({ loja, onPress }: Props) {
  const media = calcularMediaAvaliacoes(loja.avaliacoes || []);
  const totalAvaliacoes = loja.avaliacoes?.length || 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <Image source={{ uri: loja.fotoUrl }} style={styles.foto} resizeMode="cover" />
      <View style={styles.conteudo}>
        <Text style={styles.nome} numberOfLines={1}>{loja.nome}</Text>
        <Text style={styles.endereco} numberOfLines={1}>📍 {loja.endereco}</Text>
        <View style={styles.rodape}>
          {totalAvaliacoes > 0 ? (
            <Text style={styles.nota}>⭐ {formatarNota(media)} ({totalAvaliacoes})</Text>
          ) : (
            <Text style={styles.semNota}>Sem avaliações</Text>
          )}
          {loja.precoMedio > 0 && (
            <Text style={styles.preco}>A partir de {formatarPreco(loja.precoMedio)}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  foto: { width: "100%", height: 160 },
  conteudo: { padding: SPACING.md },
  nome: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  endereco: { fontSize: 12, color: COLORS.muted, marginBottom: SPACING.sm },
  rodape: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nota: { fontSize: 13, color: "#fbbf24", fontWeight: "600" },
  semNota: { fontSize: 12, color: COLORS.muted },
  preco: { fontSize: 12, color: COLORS.primary, fontWeight: "600" },
});
