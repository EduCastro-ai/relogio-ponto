import { Pressable, Text } from "react-native";
import { colors } from "./ui";
import { useSession } from "@/lib/session";

export function SignOutButton() {
  const { signOut } = useSession();
  return (
    <Pressable onPress={signOut} hitSlop={12} style={{ paddingHorizontal: 16 }}>
      <Text style={{ color: colors.primary, fontWeight: "600" }}>Sair</Text>
    </Pressable>
  );
}
