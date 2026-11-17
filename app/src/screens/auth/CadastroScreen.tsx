import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { signup } from "../../api/auth";
import { COLORS, SPACING, RADIUS } from "../../constants";

export default function CadastroScreen({ navigation }: any) {
  const { login } = useAuth();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [telefone, setTelefone] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleCadastro() {
    if (!nome.trim() || !email.trim() || !senha.trim()) {
      Alert.alert("Atenção", "Preencha nome, email e senha.");
      return;
    }
    if (senha.length < 6) {
      Alert.alert("Atenção", "A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setCarregando(true);
    try {
      const { token, usuario } = await signup(nome.trim(), email.trim(), senha, telefone.trim() || undefined);
      await login(token, usuario);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("Erro ao criar conta", err.message || "Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>AutoShine</Text>
        <Text style={styles.titulo}>Criar conta</Text>
        <Text style={styles.subtitulo}>Crie sua conta para agendar serviços.</Text>

        {[
          { label: "Nome completo", value: nome, set: setNome, placeholder: "Seu nome", type: "default" as const },
          { label: "Email", value: email, set: setEmail, placeholder: "seu@email.com", type: "email-address" as const },
          { label: "Telefone (opcional)", value: telefone, set: setTelefone, placeholder: "(62) 99999-9999", type: "phone-pad" as const },
        ].map(({ label, value, set, placeholder, type }) => (
          <View key={label} style={styles.campo}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={set}
              placeholder={placeholder}
              placeholderTextColor={COLORS.muted}
              keyboardType={type}
              autoCapitalize={type === "default" ? "words" : "none"}
            />
          </View>
        ))}

        <View style={styles.campo}>
          <Text style={styles.label}>Senha</Text>
          <TextInput
            style={styles.input}
            value={senha}
            onChangeText={setSenha}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={COLORS.muted}
            secureTextEntry
          />
        </View>

        <TouchableOpacity style={styles.botao} onPress={handleCadastro} disabled={carregando}>
          {carregando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botaoTexto}>Criar conta</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Login")} style={styles.linkWrap}>
          <Text style={styles.link}>Já tem conta? <Text style={styles.linkDestaque}>Entrar</Text></Text>
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
