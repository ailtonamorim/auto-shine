import React, { useEffect, useState } from "react";
import {
  View, Text, Image, ScrollView, StyleSheet,
  ActivityIndicator, TouchableOpacity, Alert,
} from "react-native";
import { getLoja } from "../../api/lojas";
import { Loja } from "../../types";
import { formatarPreco, calcularMediaAvaliacoes, formatarNota, formatarData } from "../../utils";
import { COLORS, SPACING, RADIUS } from "../../constants";

export default function PerfilLojaScreen({ route, navigation }: any) {
  const { lojaId } = route.params;
  const [loja, setLoja] = useState<Loja | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    getLoja(lojaId)
      .then(setLoja)
      .catch(() => Alert.alert("Erro", "Não foi possível carregar o lava jato."))
      .finally(() => setCarregando(false));
  }, [lojaId]);

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!loja) {
    return (
      <View style={styles.centro}>
        <Text style={{ color: COLORS.muted }}>Lava jato não encontrado.</Text>
      </View>
    );
  }

  const media = calcularMediaAvaliacoes(loja.avaliacoes || []);
  const totalAvaliacoes = loja.avaliacoes?.length || 0;
  const diasFuncionamento = loja.agendaDias || "";
  const horarios = loja.agendaHorarios || "";

  return (
    <View style={styles.container}>
      {/* Botão voltar */}
      <TouchableOpacity style={styles.btnVoltar} onPress={() => navigation.goBack()}>
        <Text style={styles.btnVoltarTexto}>← Voltar</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Foto principal */}
        <Image source={{ uri: loja.fotoUrl }} style={styles.foto} resizeMode="cover" />

        <View style={styles.conteudo}>
          {/* Nome e avaliação */}
          <Text style={styles.nome}>{loja.nome}</Text>
          <View style={styles.metaRow}>
            {totalAvaliacoes > 0 ? (
              <Text style={styles.nota}>⭐ {formatarNota(media)} ({totalAvaliacoes} avaliações)</Text>
            ) : (
              <Text style={styles.semNota}>Sem avaliações ainda</Text>
            )}
          </View>

          <Text style={styles.endereco}>📍 {loja.endereco}</Text>
          <Text style={styles.descricao}>{loja.descricao}</Text>

          {/* Formas de pagamento */}
          {loja.formasPagamento ? (
            <View style={styles.secao}>
              <Text style={styles.secaoTitulo}>Formas de pagamento</Text>
              <Text style={styles.secaoTexto}>💳 {loja.formasPagamento}</Text>
            </View>
          ) : null}

          {/* Horários */}
          {horarios ? (
            <View style={styles.secao}>
              <Text style={styles.secaoTitulo}>Horários disponíveis</Text>
              <Text style={styles.secaoTexto}>🕐 {horarios}</Text>
            </View>
          ) : null}

          {/* Serviços */}
          <View style={styles.secao}>
            <Text style={styles.secaoTitulo}>Serviços</Text>
            {loja.servicos?.length > 0 ? (
              loja.servicos.map((servico) => (
                <View key={servico.id} style={styles.servicoCard}>
                  <View style={styles.servicoInfo}>
                    <Text style={styles.servicoNome}>{servico.nome}</Text>
                    {servico.descricao ? (
                      <Text style={styles.servicoDesc}>{servico.descricao}</Text>
                    ) : null}
                    {servico.duracao ? (
                      <Text style={styles.servicoDuracao}>⏱ {servico.duracao}</Text>
                    ) : null}
                  </View>
                  <View style={styles.servicoPrecoWrap}>
                    <Text style={styles.servicoPreco}>{formatarPreco(servico.preco)}</Text>
                    <TouchableOpacity
                      style={styles.btnAgendar}
                      onPress={() => navigation.navigate("Agendamento", { loja, servicoId: servico.id })}
                    >
                      <Text style={styles.btnAgendarTexto}>Agendar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.secaoTexto}>Nenhum serviço cadastrado.</Text>
            )}
          </View>

          {/* Avaliações */}
          {totalAvaliacoes > 0 && (
            <View style={styles.secao}>
              <Text style={styles.secaoTitulo}>Avaliações</Text>
              {loja.avaliacoes.slice(0, 5).map((av) => (
                <View key={av.id} style={styles.avaliacaoCard}>
                  <View style={styles.avaliacaoHeader}>
                    <Text style={styles.avaliacaoNome}>{av.usuario?.nome || "Cliente"}</Text>
                    <Text style={styles.avaliacaoNota}>{"⭐".repeat(av.nota)}</Text>
                  </View>
                  {av.comentario ? (
                    <Text style={styles.avaliacaoComentario}>{av.comentario}</Text>
                  ) : null}
                  <Text style={styles.avaliacaoData}>{formatarData(av.createdAt)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centro: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
  btnVoltar: {
    position: "absolute", top: 48, left: SPACING.md, zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  btnVoltarTexto: { color: "#fff", fontWeight: "600", fontSize: 14 },
  foto: { width: "100%", height: 260 },
  conteudo: { padding: SPACING.lg },
  nome: { fontSize: 22, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.xs },
  nota: { fontSize: 14, color: "#fbbf24", fontWeight: "600" },
  semNota: { fontSize: 13, color: COLORS.muted },
  endereco: { fontSize: 13, color: COLORS.muted, marginBottom: SPACING.md },
  descricao: { fontSize: 14, color: COLORS.text, lineHeight: 22, marginBottom: SPACING.md },
  secao: { marginBottom: SPACING.lg },
  secaoTitulo: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: SPACING.sm },
  secaoTexto: { fontSize: 14, color: COLORS.muted },
  servicoCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  servicoInfo: { flex: 1, marginRight: SPACING.md },
  servicoNome: { fontSize: 14, fontWeight: "700", color: COLORS.text, marginBottom: 2 },
  servicoDesc: { fontSize: 12, color: COLORS.muted, marginBottom: 2 },
  servicoDuracao: { fontSize: 12, color: COLORS.muted },
  servicoPrecoWrap: { alignItems: "flex-end" },
  servicoPreco: { fontSize: 14, fontWeight: "700", color: COLORS.primary, marginBottom: SPACING.xs },
  btnAgendar: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.sm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  btnAgendarTexto: { color: "#fff", fontSize: 12, fontWeight: "700" },
  avaliacaoCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  avaliacaoHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  avaliacaoNome: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  avaliacaoNota: { fontSize: 12 },
  avaliacaoComentario: { fontSize: 13, color: COLORS.text, marginBottom: 4 },
  avaliacaoData: { fontSize: 11, color: COLORS.muted },
});
