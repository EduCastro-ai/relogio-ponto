import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const colors = {
  bg: "#F6F7F9",
  card: "#FFFFFF",
  text: "#1B1F24",
  muted: "#5E6875",
  border: "#DDE1E6",
  primary: "#1D5FD1",
  danger: "#B42318",
  warn: "#B54708",
  ok: "#067647",
};

/** `top`: telas sem cabeçalho de navegação (login, onboarding) precisam do recuo da barra de status. */
export function Screen({ children, scroll = true, top = false }: { children: ReactNode; scroll?: boolean; top?: boolean }) {
  const body = <View style={s.body}>{children}</View>;
  return (
    <SafeAreaView style={s.screen} edges={top ? ["top", "bottom", "left", "right"] : ["bottom", "left", "right"]}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, strong && s.strong]}>{label}</Text>
      <Text style={[s.rowValue, strong && s.strong]}>{value}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, primary ? s.btnPrimary : s.btnSecondary, (disabled || pressed) && { opacity: 0.6 }]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? "#fff" : colors.primary} />
      ) : (
        <Text style={[s.btnText, !primary && { color: colors.primary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={s.input} {...props} />
    </View>
  );
}

export function Loading() {
  return (
    <View style={[s.screen, { justifyContent: "center" }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { color: colors.muted, flexShrink: 1 },
  rowValue: { color: colors.text, fontVariant: ["tabular-nums"] },
  strong: { color: colors.text, fontWeight: "700" },
  btn: { borderRadius: 10, paddingVertical: 14, alignItems: "center", minHeight: 48, justifyContent: "center" },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  label: { color: colors.text, fontWeight: "600" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
});
