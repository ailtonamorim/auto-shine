import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { COLORS, SPACING, RADIUS } from "../../constants";

export default function PerfilScreen({ navigation }: any) {
  const { usuario, logout } = useAuth();

  if (!usuario) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.titulo}>Perfil</Text>
        </View>
        <View style={styles.card}>
          <Text style={{ color: COLORS.muted, marginBottom: SPACING.lg, textAlign: "center" }}>
            Entre na sua conta para ver seu perfil.
          </Text>
          <TouchableOpacity style={[styles.botaoSair, { borderColor: COLORS.primary }]} onPress={() => navigation.navigate("Login")}>
            <Text style={[styles.botaoSairTexto, { color: COLORS.primary }]}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function handleLogout() {
    Alert.alert("Sair", "Deseja sair da sua conta?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: logout },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titulo}>Perfil</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetra}>{usuario?.nome?.[0]?.toUpperCase() || "?"}</Text>
        </View>
        <Text style={styles.nome}>{usuario?.nome}</Text>
        <Text style={styles.email}>{usuario?.email}</Text>
      </View>

      <TouchableOpacity style={styles.botaoSair} onPress={handleLogout}>
        <Text style={styles.botaoSairTexto}>Sair da conta</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.md },
  titulo: { fontSize: 24, fontWeight: "800", color: COLORS.text },
  card: {
    backgroundColor: COLORS.card,
    margin: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  avatarLetra: { fontSize: 32, fontWeight: "800", color: "#fff" },
  nome: { fontSize: 20, fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  email: { fontSize: 14, color: COLORS.muted },
  botaoSair: {
    marginHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
  },
  botaoSairTexto: { color: COLORS.danger, fontWeight: "700", fontSize: 15 },
});
