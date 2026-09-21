import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, Platform, Linking,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { getLojas } from "../../api/lojas";
import { Loja } from "../../types";
import { COLORS, SPACING, RADIUS } from "../../constants";
import { formatarPreco, calcularMediaAvaliacoes, formatarNota } from "../../utils";

export default function MapaScreen({ navigation }: any) {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [localizacaoAtiva, setLocalizacaoAtiva] = useState(false);
  const [lojaSelecionada, setLojaSelecionada] = useState<Loja | null>(null);
  const mapRef = useRef<MapView>(null);

  const regiaoInicial = {
    latitude: -16.6869,
    longitude: -49.2648,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };

  useEffect(() => {
    getLojas()
      .then(setLojas)
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  function abrirNavegacao(loja: Loja) {
    const { latitude, longitude, nome } = loja;
    const label = encodeURIComponent(nome);
    const url = Platform.OS === "ios"
      ? `maps://?daddr=${latitude},${longitude}&dirflg=d`
      : `google.navigation:q=${latitude},${longitude}`;
    const urlFallback = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&destination_place_name=${label}`;

    Linking.canOpenURL(url).then((suporta) => {
      Linking.openURL(suporta ? url : urlFallback);
    });
  }

  async function usarMinhaLocalizacao() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permissão negada", "Ative a localização nas configurações do iPhone.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }, 800);
      setLocalizacaoAtiva(true);
    } catch {
      Alert.alert("Erro", "Não foi possível obter sua localização.");
    }
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
      <MapView
        ref={mapRef}
        style={styles.mapa}
        provider={PROVIDER_DEFAULT}
        initialRegion={regiaoInicial}
        showsUserLocation={localizacaoAtiva}
        showsMyLocationButton={false}
      >
        {lojas
          .filter((l) => l.latitude && l.longitude)
          .map((loja) => (
            <Marker
              key={loja.id}
              coordinate={{ latitude: loja.latitude, longitude: loja.longitude }}
              title={loja.nome}
              onPress={() => setLojaSelecionada(loja)}
            >
              <View style={styles.marcador}>
                <Text style={styles.marcadorTexto}>🚗</Text>
              </View>
            </Marker>
          ))}
      </MapView>

      {/* Botão de localização */}
      <TouchableOpacity style={styles.btnLocalizacao} onPress={usarMinhaLocalizacao}>
        <Text style={styles.btnLocalizacaoTexto}>
          {localizacaoAtiva ? "📍 Localização ativa" : "📍 Minha localização"}
        </Text>
      </TouchableOpacity>

      {/* Card da loja selecionada */}
      {lojaSelecionada && (
        <View style={styles.cardLoja}>
          <TouchableOpacity
            style={styles.cardFechar}
            onPress={() => setLojaSelecionada(null)}
          >
            <Text style={{ color: COLORS.muted, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.cardNome} numberOfLines={1}>{lojaSelecionada.nome}</Text>
          <Text style={styles.cardEndereco} numberOfLines={1}>📍 {lojaSelecionada.endereco}</Text>

          <View style={styles.cardRodape}>
            {lojaSelecionada.avaliacoes?.length > 0 ? (
              <Text style={styles.cardNota}>
                ⭐ {formatarNota(calcularMediaAvaliacoes(lojaSelecionada.avaliacoes))}
              </Text>
            ) : null}
            {lojaSelecionada.precoMedio > 0 ? (
              <Text style={styles.cardPreco}>
                A partir de {formatarPreco(lojaSelecionada.precoMedio)}
              </Text>
            ) : null}
          </View>

          <View style={styles.cardBotoes}>
            <TouchableOpacity
              style={styles.btnComoChegar}
              onPress={() => abrirNavegacao(lojaSelecionada)}
            >
              <Text style={styles.btnComoChgarTexto}>🧭 Como chegar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnVerPerfil}
              onPress={() => {
                setLojaSelecionada(null);
                navigation.navigate("PerfilLoja", { lojaId: lojaSelecionada.id });
              }}
            >
              <Text style={styles.btnVerPerfilTexto}>Ver serviços →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centro: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
  mapa: { flex: 1 },
  marcador: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 6,
    borderWidth: 2,
    borderColor: "#fff",
  },
  marcadorTexto: { fontSize: 16 },
  btnLocalizacao: {
    position: "absolute",
    top: 56,
    right: SPACING.md,
    backgroundColor: COLORS.bgSoft,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnLocalizacaoTexto: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  cardLoja: {
    position: "absolute",
    bottom: 24,
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardFechar: { position: "absolute", top: SPACING.sm, right: SPACING.sm, padding: 4 },
  cardNome: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 4, marginRight: 24 },
  cardEndereco: { fontSize: 12, color: COLORS.muted, marginBottom: SPACING.sm },
  cardRodape: { flexDirection: "row", justifyContent: "space-between", marginBottom: SPACING.sm },
  cardNota: { fontSize: 13, color: "#fbbf24", fontWeight: "600" },
  cardPreco: { fontSize: 12, color: COLORS.primary, fontWeight: "600" },
  cardBotoes: { flexDirection: "row", gap: SPACING.sm },
  btnComoChegar: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: "center",
  },
  btnComoChgarTexto: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  btnVerPerfil: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: "center",
  },
  btnVerPerfilTexto: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
