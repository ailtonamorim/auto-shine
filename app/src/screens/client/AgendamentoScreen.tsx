import React, { useEffect, useState, useContext } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { AuthContext } from "../../context/AuthContext";
import { getDisponibilidade, criarAgendamento } from "../../api/agendamentos";
import { Loja, Servico } from "../../types";
import { COLORS, SPACING, RADIUS } from "../../constants";
import { formatarPreco } from "../../utils";

const VEICULOS = ["Carro", "Moto", "Caminhonete"];

function gerarProximosDias(quantidade: number): { label: string; value: string; diaSemana: string }[] {
  const dias = [];
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  for (let i = 0; i < quantidade; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    dias.push({
      value: `${ano}-${mes}-${dia}`,
      label: `${d.getDate()} ${meses[d.getMonth()]}`,
      diaSemana: i === 0 ? "Hoje" : diasSemana[d.getDay()],
    });
  }
  return dias;
}

export default function AgendamentoScreen({ route, navigation }: any) {
  const { loja, servicoId } = route.params as { loja: Loja; servicoId: number };
  const { token, usuario } = useContext(AuthContext);

  const servico = loja.servicos?.find((s) => s.id === servicoId) as Servico | undefined;

  const dias = gerarProximosDias(14);
  const [dataSelecionada, setDataSelecionada] = useState(dias[0].value);
  const [horaSelecionada, setHoraSelecionada] = useState<string | null>(null);
  const [veiculo, setVeiculo] = useState("Carro");
  const [notas, setNotas] = useState("");
  const [slots, setSlots] = useState<{ hora: string; disponivel: boolean }[]>([]);
  const [carregandoSlots, setCarregandoSlots] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) {
      navigation.navigate("Login");
      return;
    }
    buscarDisponibilidade(dataSelecionada);
  }, []);

  useEffect(() => {
    setHoraSelecionada(null);
    buscarDisponibilidade(dataSelecionada);
  }, [dataSelecionada]);

  async function buscarDisponibilidade(data: string) {
    setCarregandoSlots(true);
    try {
      const resp = await getDisponibilidade(loja.id, data);
      setSlots(resp.aberto ? resp.horarios : []);
    } catch {
      setSlots([]);
    } finally {
      setCarregandoSlots(false);
    }
  }

  async function confirmarAgendamento() {
    if (!token) { navigation.navigate("Login"); return; }
    if (!horaSelecionada) { Alert.alert("Atenção", "Selecione um horário."); return; }

    setEnviando(true);
    try {
      await criarAgendamento(token, {
        lojaId: loja.id,
        servicoId: servico!.id,
        data: dataSelecionada,
        hora: horaSelecionada,
        veiculo,
        notas: notas.trim() || undefined,
      });
      Alert.alert(
        "Agendado! ✅",
        `Seu agendamento em ${loja.nome} foi confirmado para ${horaSelecionada} do dia ${dataSelecionada.split("-").reverse().join("/")}.`,
        [{ text: "Ver meus agendamentos", onPress: () => navigation.navigate("Agendamentos") }]
      );
    } catch (err: any) {
      Alert.alert("Erro", err.message || "Não foi possível agendar.");
    } finally {
      setEnviando(false);
    }
  }

  if (!servico) {
    return (
      <View style={styles.centro}>
        <Text style={{ color: COLORS.muted }}>Serviço não encontrado.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.btnVoltar}>
          <Text style={styles.btnVoltarTexto}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitulo}>Agendar serviço</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Card do serviço */}
        <View style={styles.servicoCard}>
          <View>
            <Text style={styles.servicoNome}>{servico.nome}</Text>
            <Text style={styles.lojaInfo}>📍 {loja.nome}</Text>
            {servico.duracao ? <Text style={styles.servicoMeta}>⏱ {servico.duracao}</Text> : null}
          </View>
          <Text style={styles.servicoPreco}>{formatarPreco(servico.preco)}</Text>
        </View>

        {/* Seleção de data */}
        <Text style={styles.secaoTitulo}>Escolha a data</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.diasScroll}>
          {dias.map((dia) => {
            const ativo = dia.value === dataSelecionada;
            return (
              <TouchableOpacity
                key={dia.value}
                style={[styles.diaCard, ativo && styles.diaCardAtivo]}
                onPress={() => setDataSelecionada(dia.value)}
              >
                <Text style={[styles.diaSemana, ativo && styles.diaTextoAtivo]}>{dia.diaSemana}</Text>
                <Text style={[styles.diaNumero, ativo && styles.diaTextoAtivo]}>{dia.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Seleção de horário */}
        <Text style={styles.secaoTitulo}>Escolha o horário</Text>
        {carregandoSlots ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
        ) : slots.length === 0 ? (
          <Text style={styles.semSlots}>Loja fechada nesta data. Escolha outro dia.</Text>
        ) : (
          <View style={styles.slotsGrid}>
            {slots.map((slot) => {
              const ativo = slot.hora === horaSelecionada;
              return (
                <TouchableOpacity
                  key={slot.hora}
                  disabled={!slot.disponivel}
                  style={[
                    styles.slotBtn,
                    ativo && styles.slotBtnAtivo,
                    !slot.disponivel && styles.slotBtnOcupado,
                  ]}
                  onPress={() => setHoraSelecionada(slot.hora)}
                >
                  <Text style={[
                    styles.slotTexto,
                    ativo && styles.slotTextoAtivo,
                    !slot.disponivel && styles.slotTextoOcupado,
                  ]}>
                    {slot.hora}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Tipo de veículo */}
        <Text style={styles.secaoTitulo}>Tipo de veículo</Text>
        <View style={styles.veiculoRow}>
          {VEICULOS.map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.veiculoBtn, veiculo === v && styles.veiculoBtnAtivo]}
              onPress={() => setVeiculo(v)}
            >
              <Text style={[styles.veiculoTexto, veiculo === v && styles.veiculoTextoAtivo]}>
                {v === "Carro" ? "🚗 " : v === "Moto" ? "🏍️ " : "🚙 "}{v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Observações */}
        <Text style={styles.secaoTitulo}>Observações (opcional)</Text>
        <TextInput
          style={styles.notasInput}
          placeholder="Ex: carro vermelho, limpeza interna também..."
          placeholderTextColor={COLORS.muted}
          value={notas}
          onChangeText={setNotas}
          multiline
          numberOfLines={3}
        />

        {/* Resumo */}
        {horaSelecionada && (
          <View style={styles.resumo}>
            <Text style={styles.resumoTitulo}>Resumo do agendamento</Text>
            <Text style={styles.resumoItem}>🔧 {servico.nome}</Text>
            <Text style={styles.resumoItem}>📅 {dataSelecionada.split("-").reverse().join("/")} às {horaSelecionada}</Text>
            <Text style={styles.resumoItem}>{veiculo === "Carro" ? "🚗" : veiculo === "Moto" ? "🏍️" : "🚙"} {veiculo}</Text>
            <Text style={styles.resumoPreco}>{formatarPreco(servico.preco)}</Text>
          </View>
        )}

        {/* Botão confirmar */}
        <TouchableOpacity
          style={[styles.btnConfirmar, (!horaSelecionada || enviando) && styles.btnConfirmarDisabled]}
          onPress={confirmarAgendamento}
          disabled={!horaSelecionada || enviando}
        >
          {enviando
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnConfirmarTexto}>Confirmar agendamento</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
  header: {
    backgroundColor: COLORS.bgSoft,
    paddingTop: 52,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
  },
  btnVoltar: { marginRight: SPACING.md },
  btnVoltarTexto: { color: COLORS.primary, fontSize: 15, fontWeight: "600" },
  headerTitulo: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { padding: SPACING.md },

  servicoCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  servicoNome: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  lojaInfo: { fontSize: 13, color: COLORS.muted, marginBottom: 2 },
  servicoMeta: { fontSize: 12, color: COLORS.muted },
  servicoPreco: { fontSize: 18, fontWeight: "800", color: COLORS.primary },

  secaoTitulo: { fontSize: 15, fontWeight: "700", color: COLORS.text, marginBottom: SPACING.sm, marginTop: SPACING.sm },

  diasScroll: { marginBottom: SPACING.md },
  diaCard: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.card,
    minWidth: 64,
  },
  diaCardAtivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  diaSemana: { fontSize: 11, color: COLORS.muted, fontWeight: "600", marginBottom: 2 },
  diaNumero: { fontSize: 13, color: COLORS.text, fontWeight: "700" },
  diaTextoAtivo: { color: "#fff" },

  semSlots: { color: COLORS.muted, fontSize: 14, marginBottom: SPACING.md },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.md },
  slotBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  slotBtnAtivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  slotBtnOcupado: { backgroundColor: "transparent", borderColor: COLORS.border, opacity: 0.35 },
  slotTexto: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  slotTextoAtivo: { color: "#fff" },
  slotTextoOcupado: { color: COLORS.muted },

  veiculoRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
  veiculoBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
  },
  veiculoBtnAtivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  veiculoTexto: { color: COLORS.muted, fontSize: 12, fontWeight: "600" },
  veiculoTextoAtivo: { color: "#fff" },

  notasInput: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 14,
    textAlignVertical: "top",
    minHeight: 80,
    marginBottom: SPACING.lg,
  },

  resumo: {
    backgroundColor: COLORS.bgSoft,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  resumoTitulo: { fontSize: 13, fontWeight: "700", color: COLORS.primary, marginBottom: SPACING.sm },
  resumoItem: { fontSize: 13, color: COLORS.text, marginBottom: 4 },
  resumoPreco: { fontSize: 18, fontWeight: "800", color: COLORS.primary, marginTop: SPACING.xs },

  btnConfirmar: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  btnConfirmarDisabled: { opacity: 0.4 },
  btnConfirmarTexto: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
