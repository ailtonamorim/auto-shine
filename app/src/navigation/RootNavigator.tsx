import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";
import AppNavigator from "./AppNavigator";
import { COLORS } from "../constants";

export default function RootNavigator() {
  const { carregando } = useAuth();

  if (carregando) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // App sempre abre na tela principal.
  // Login é solicitado apenas quando o usuário tenta uma ação que exige conta.
  return <AppNavigator />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
});
