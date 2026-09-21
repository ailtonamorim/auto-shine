import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity, Alert, TouchableOpacityProps,
} from "react-native";
import { getMeusAgendamentos, cancelarAgendamento } from "../../api/agendamentos";
import { useAuth } from "../../context/AuthContext";
import { Agendamento } from "../../types";
import { formatarData, formatarPreco } from "../../utils";
import { COLORS, SPACING, RADIUS } from "../../constants";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const STATUS_COR: Record<string, string> = {
  pendente: "#f59e0b",
  confirmado: COLORS.primary,
  concluido: COLORS.success,
  cancelado: COLORS.danger,
};

export default function AgendamentosScreen({ navigation }: any) {
  const { token } = useAuth();

  if (!token) {
    return (
      <View style={[styles.centro, { padding: 32 }]}>
        <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
          Seus agendamentos
        </Text>
        <Text style={{ color: COLORS.muted, textAlign: "center", marginBottom: 24 }}>
          Entre na sua conta para ver e gerenciar seus agendamentos.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: COLORS.primary, borderRadius: 12, padding: 14, width: "100%", alignItems: "center" }}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Entrar</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);

  async function carregar() {
    if (!token) return;
    try {
      const data = await getMeusAgendamentos(token);
      setAgendamentos(data);
    } catch {
      // mantém lista vazia
    } finally {
      setCarregando(false);
      setRecarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [token]);

  const onRecarregar = useCallback(() => {
    setRecarregando(true);
    carregar();
  }, [token]);

  async function handleCancelar(id: number) {
    Alert.alert("Cancelar agendamento", "Tem certeza que deseja cancelar?", [
      { text: "Não", style: "cancel" },
      {
        text: "Sim, cancelar",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelarAgendamento(token!, id);
            carregar();
          } catch (err: any) {
            Alert.alert("Erro", err.message || "Não foi possível cancelar.");
          }
        },
      },
    ]);
  }

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titulo}>Meus agendamentos</Text>
      </View>
      <FlatList
        data={agendamentos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.lista}
        refreshControl={<RefreshControl refreshing={recarregando} onRefresh={onRecarregar} tintColor={COLORS.primary} />}
        ListEmptyComponent={<Text style={styles.vazio}>Você ainda não tem agendamentos.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.lojaNome} numberOfLines={1}>{item.loja.nome}</Text>
              <Text style={[styles.status, { color: STATUS_COR[item.status] }]}>
                {STATUS_LABEL[item.status]}
              </Text>
            </View>
            <Text style={styles.servico}>{item.servico.nome}</Text>
            <Text style={styles.info}>📅 {formatarData(item.data)} às {item.hora}</Text>
            <Text style={styles.info}>💰 {formatarPreco(item.servico.preco)}</Text>
            {item.status === "pendente" && (
              <TouchableOpacity style={styles.botaoCancelar} onPress={() => handleCancelar(item.id)}>
                <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centro: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.md },
  titulo: { fontSize: 24, fontWeight: "800", color: COLORS.text },
  lista: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  vazio: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  lojaNome: { fontSize: 15, fontWeight: "700", color: COLORS.text, flex: 1, marginRight: SPACING.sm },
  status: { fontSize: 12, fontWeight: "600" },
  servico: { fontSize: 14, color: COLORS.text, marginBottom: 6 },
  info: { fontSize: 12, color: COLORS.muted, marginBottom: 2 },
  botaoCancelar: {
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    alignItems: "center",
  },
  botaoCancelarTexto: { color: COLORS.danger, fontSize: 13, fontWeight: "600" },
});
