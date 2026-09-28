import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, TextInput, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from "react-native";
import { getLojas } from "../../api/lojas";
import { Loja } from "../../types";
import { COLORS, SPACING, RADIUS } from "../../constants";
import LojaCard from "../../components/ui/LojaCard";

export default function HomeScreen({ navigation }: any) {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [filtradas, setFiltradas] = useState<Loja[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);

  async function carregar() {
    try {
      const data = await getLojas();
      setLojas(data);
      setFiltradas(data);
    } catch {
      // mantém lista vazia
    } finally {
      setCarregando(false);
      setRecarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    const termo = busca.toLowerCase().trim();
    if (!termo) {
      setFiltradas(lojas);
    } else {
      setFiltradas(lojas.filter((l) =>
        l.nome.toLowerCase().includes(termo) ||
        l.endereco.toLowerCase().includes(termo) ||
        l.categoria.toLowerCase().includes(termo)
      ));
    }
  }, [busca, lojas]);

  const onRecarregar = useCallback(() => {
    setRecarregando(true);
    carregar();
  }, []);

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
        <Text style={styles.titulo}>Lava jatos</Text>
        <Text style={styles.subtitulo}>Encontre o melhor perto de você</Text>
      </View>

      <TextInput
        style={styles.busca}
        value={busca}
        onChangeText={setBusca}
        placeholder="Buscar lava jato..."
        placeholderTextColor={COLORS.muted}
      />

      <FlatList
        data={filtradas}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <LojaCard loja={item} onPress={() => navigation.navigate("PerfilLoja", { lojaId: item.id })} />
        )}
        contentContainerStyle={styles.lista}
        refreshControl={<RefreshControl refreshing={recarregando} onRefresh={onRecarregar} tintColor={COLORS.primary} />}
        ListEmptyComponent={<Text style={styles.vazio}>Nenhum lava jato encontrado.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centro: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.md },
  titulo: { fontSize: 24, fontWeight: "800", color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  busca: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.bgSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 14,
  },
  lista: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  vazio: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl },
});
