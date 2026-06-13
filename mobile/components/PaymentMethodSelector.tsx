import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native-gesture-handler";
import tw from "@/lib/tailwind";
import type { EnabledPaymentMethodOption } from "@/utils/paymentMethods";

const BRAND_GREEN = tw.color("base-green") ?? "#3C8F7C";

type Props = {
  selected: string;
  onSelect: (uiKey: string) => void;
  enabledMethods: EnabledPaymentMethodOption[];
  walletBalance?: number | null;
  fareTotal?: number;
  /** compact = horizontal tiles (find-ride vehicle step) */
  variant?: "compact" | "cards";
};

function iconName(id: string): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (id) {
    case "cash":
      return "cash";
    case "card":
      return "credit-card-outline";
    case "transfer":
      return "bank-transfer";
    default:
      return "wallet-outline";
  }
}

function subtitleForMethod(
  method: EnabledPaymentMethodOption,
  walletBalance: number | null | undefined,
  fareTotal: number | undefined
): string | undefined {
  if (method.id === "wallet") {
    if (walletBalance != null && Number.isFinite(walletBalance)) {
      const balanceText = `Balance: ₦${Math.round(walletBalance).toLocaleString()}`;
      if (
        fareTotal != null &&
        fareTotal > 0 &&
        walletBalance < fareTotal
      ) {
        const shortfall = Math.ceil(fareTotal - walletBalance);
        return `${balanceText} · Top up ₦${shortfall.toLocaleString()}`;
      }
      return balanceText;
    }
    return "Pay from wallet balance";
  }
  if (method.id === "cash") {
    return "Pay driver directly";
  }
  if (method.id === "card") {
    return "Pay by card";
  }
  if (method.id === "transfer") {
    return "Pay by bank transfer";
  }
  return undefined;
}

export default function PaymentMethodSelector({
  selected,
  onSelect,
  enabledMethods,
  walletBalance,
  fareTotal,
  variant = "compact",
}: Props) {
  if (!enabledMethods.length) {
    return (
      <Text style={styles.emptyText}>No payment methods available.</Text>
    );
  }

  if (variant === "cards") {
    return (
      <View style={styles.cardsWrap}>
        {enabledMethods.map((method) => {
          const isActive = selected === method.uiKey;
          const subtitle = subtitleForMethod(method, walletBalance, fareTotal);
          return (
            <TouchableOpacity
              key={method.id}
              onPress={() => onSelect(method.uiKey)}
              style={[
                styles.cardOption,
                isActive && styles.cardOptionActive,
              ]}
            >
              <MaterialCommunityIcons
                name={iconName(method.id)}
                size={18}
                color={isActive ? BRAND_GREEN : "#666"}
              />
              <View style={styles.cardTextWrap}>
                <Text style={[styles.cardTitle, isActive && styles.cardTitleActive]}>
                  {method.label}
                </Text>
                {subtitle ? (
                  <Text style={styles.cardSubtitle} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.compactContainer}>
      {enabledMethods.map((method, index) => {
        const isActive = selected === method.uiKey;
        const subtitle = subtitleForMethod(method, walletBalance, fareTotal);
        const isLast = index === enabledMethods.length - 1;
        return (
          <TouchableOpacity
            key={method.id}
            onPress={() => onSelect(method.uiKey)}
            style={[
              styles.compactOption,
              isActive && styles.compactOptionActive,
              isLast && styles.compactOptionLast,
            ]}
          >
            <View style={[styles.compactIcon, isActive && styles.compactIconActive]}>
              <MaterialCommunityIcons
                name={iconName(method.id)}
                size={16}
                color={isActive ? BRAND_GREEN : "#666"}
              />
            </View>
            <Text style={[styles.compactTitle, isActive && styles.compactTitleActive]}>
              {method.label}
            </Text>
            {subtitle ? (
              <Text style={styles.compactSubtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    fontSize: 13,
    color: "#8E8E93",
    fontFamily: "RobotoRegular",
  },
  compactContainer: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: "#EFEFF4",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#FAFAFA",
  },
  compactOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: "#EFEFF4",
  },
  compactOptionLast: {
    borderRightWidth: 0,
  },
  compactOptionActive: {
    backgroundColor: "#F0F9F4",
  },
  compactIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    opacity: 0.55,
  },
  compactIconActive: {
    opacity: 1,
  },
  compactTitle: {
    fontSize: 10,
    color: "#666",
    fontFamily: "RobotoMedium",
    textAlign: "center",
  },
  compactTitleActive: {
    color: "#1A1A1A",
  },
  compactSubtitle: {
    marginTop: 2,
    fontSize: 8,
    lineHeight: 11,
    color: "#8E8E93",
    fontFamily: "RobotoRegular",
    textAlign: "center",
  },
  cardsWrap: {
    gap: 8,
  },
  cardOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
    borderWidth: 1.5,
    borderColor: "#F5F5F5",
  },
  cardOptionActive: {
    backgroundColor: "#F0F9F4",
    borderColor: BRAND_GREEN,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 13,
    color: "#242E42",
    fontFamily: "RobotoBold",
  },
  cardTitleActive: {
    color: "#242E42",
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: "#666",
    fontFamily: "RobotoRegular",
  },
});
