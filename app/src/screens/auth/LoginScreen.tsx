import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { login as apiLogin } from "../../api/auth";
import { COLORS, SPACING, RADIUS } from "../../constants";

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !senha.trim()) {
      Alert.alert("Atenção", "Preencha email e senha.");
      return;
    }
    setCarregando(true);
    try {
      const { token, usuario } = await apiLogin(email.trim(), senha);
      await login(token, usuario);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("Erro ao entrar", err.message || "Verifique seus dados e tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>AutoShine</Text>
        <Text style={styles.titulo}>Entrar</Text>
        <Text style={styles.subtitulo}>Encontre o melhor lava jato perto de você.</Text>

        <View style={styles.campo}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.campo}>
          <Text style={styles.label}>Senha</Text>
          <TextInput
            style={styles.input}
            value={senha}
            onChangeText={setSenha}
            placeholder="Sua senha"
            placeholderTextColor={COLORS.muted}
            secureTextEntry
          />
        </View>

        <TouchableOpacity style={styles.botao} onPress={handleLogin} disabled={carregando}>
          {carregando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botaoTexto}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Cadastro")} style={styles.linkWrap}>
          <Text style={styles.link}>Não tem conta? <Text style={styles.linkDestaque}>Criar conta</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  container: { flexGrow: 1, padding: SPACING.lg, justifyContent: "center" },
  logo: { fontSize: 28, fontWeight: "800", color: COLORS.primary, marginBottom: SPACING.lg, textAlign: "center" },
  titulo: { fontSize: 26, fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs },
  subtitulo: { fontSize: 14, color: COLORS.muted, marginBottom: SPACING.xl },
  campo: { marginBottom: SPACING.md },
  label: { fontSize: 13, color: COLORS.muted, marginBottom: SPACING.xs, fontWeight: "600" },
  input: {
    backgroundColor: COLORS.bgSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
  },
  botao: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  botaoTexto: { color: "#fff", fontWeight: "700", fontSize: 16 },
  linkWrap: { marginTop: SPACING.lg, alignItems: "center" },
  link: { color: COLORS.muted, fontSize: 14 },
  linkDestaque: { color: COLORS.primary, fontWeight: "600" },
});
