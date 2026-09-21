import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import HomeScreen from "../screens/client/HomeScreen";
import AgendamentosScreen from "../screens/client/AgendamentosScreen";
import PerfilScreen from "../screens/client/PerfilScreen";
import PerfilLojaScreen from "../screens/client/PerfilLojaScreen";
import MapaScreen from "../screens/client/MapaScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import CadastroScreen from "../screens/auth/CadastroScreen";
import { COLORS } from "../constants";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: "🏠",
    Mapa: "🗺️",
    Agendamentos: "📅",
    Perfil: "👤",
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icons[name]}</Text>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: COLORS.bgSoft, borderTopColor: COLORS.border },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Início" }} />
      <Tab.Screen name="Mapa" component={MapaScreen} options={{ title: "Mapa" }} />
      <Tab.Screen name="Agendamentos" component={AgendamentosScreen} options={{ title: "Agendamentos" }} />
      <Tab.Screen name="Perfil" component={PerfilScreen} options={{ title: "Perfil" }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Tela principal — sempre acessível sem login */}
      <Stack.Screen name="Tabs" component={TabNavigator} />

      {/* Detalhe do lava jato */}
      <Stack.Screen name="PerfilLoja" component={PerfilLojaScreen} />

      {/* Auth como modais — abertos quando uma ação exige login */}
      <Stack.Screen name="Login" component={LoginScreen} options={{ presentation: "modal" }} />
      <Stack.Screen name="Cadastro" component={CadastroScreen} options={{ presentation: "modal" }} />
    </Stack.Navigator>
  );
}
