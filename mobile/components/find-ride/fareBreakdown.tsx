import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import tw from '@/lib/tailwind';

interface FareBreakdownProps {
  visible: boolean;
  onClose: () => void;
  fare: {
    baseFare?: number;
    distanceFare?: number;
    timeFare?: number;
    /** Pre-surge ride subtotal from server (for surge line). */
    preSurgeFare?: number;
    surgeMultiplier?: number;
    promoDiscount?: number;
    /** Ride fare (after surge; after promo if promoDiscount set). */
    totalFare: number;
    riderServiceCharge?: number;
    riderTotal?: number;
    currency?: string;
  };
  distance?: { text: string; value: number };
  duration?: { text: string; value: number };
}

export const FareBreakdownModal = ({ visible, onClose, fare, distance, duration }: FareBreakdownProps) => {
  const rideBeforePromo = (fare.totalFare ?? 0) + (fare.promoDiscount ?? 0);
  const surgeExtra =
    fare.preSurgeFare != null && fare.surgeMultiplier && fare.surgeMultiplier > 1
      ? Math.max(0, Math.round(rideBeforePromo - fare.preSurgeFare))
      : 0;

  const currency = (() => {
    const normalized = String(fare.currency || 'NGN').toUpperCase();
    if (normalized === 'NGN') return '₦';
    if (normalized === 'USD') return '₦';
    return `${normalized} `;
  })();
  const formatPrice = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return `${currency}0`;
    }
    return `${currency}${Math.round(amount).toLocaleString()}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Fare Breakdown</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <AntDesign name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {fare.baseFare !== undefined && (
              <View style={styles.row}>
                <Text style={styles.label}>Base Fare</Text>
                <Text style={styles.value}>{formatPrice(fare.baseFare)}</Text>
              </View>
            )}

            {fare.distanceFare !== undefined && (
              <View style={styles.row}>
                <Text style={styles.label}>
                  Distance ({String(distance?.text || '0 km')})
                </Text>
                <Text style={styles.value}>{formatPrice(fare.distanceFare)}</Text>
              </View>
            )}

            {fare.timeFare !== undefined && fare.timeFare > 0 && (
              <View style={styles.row}>
                <Text style={styles.label}>
                  Time ({String(duration?.text || '0 min')})
                </Text>
                <Text style={styles.value}>{formatPrice(fare.timeFare)}</Text>
              </View>
            )}

            {surgeExtra > 0 && (
              <View style={styles.row}>
                <Text style={[styles.label, styles.surgeLabel]}>
                  Surge ({String(fare.surgeMultiplier)}×)
                </Text>
                <Text style={[styles.value, styles.surgeValue]}>+{formatPrice(surgeExtra)}</Text>
              </View>
            )}

            {fare.promoDiscount && fare.promoDiscount > 0 && (
              <View style={styles.row}>
                <Text style={[styles.label, styles.discountLabel]}>
                  Promo Discount
                </Text>
                <Text style={[styles.value, styles.discountValue]}>
                  -{formatPrice(fare.promoDiscount)}
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            <View style={[styles.row, styles.totalRow]}>
              <Text style={styles.totalLabel}>
                {fare.riderServiceCharge != null ? 'Ride fare' : 'Total'}
              </Text>
              <Text style={styles.totalValue}>{formatPrice(fare.totalFare)}</Text>
            </View>

            {fare.riderServiceCharge != null && fare.riderServiceCharge > 0 && (
              <View style={styles.row}>
                <Text style={styles.label}>Service charge</Text>
                <Text style={styles.value}>{formatPrice(fare.riderServiceCharge)}</Text>
              </View>
            )}

            {fare.riderTotal != null && (
              <View style={[styles.row, styles.totalRow]}>
                <Text style={styles.totalLabel}>Estimated total</Text>
                <Text style={styles.totalValue}>{formatPrice(fare.riderTotal)}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: 'RobotoBold',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  label: {
    fontSize: 15,
    color: '#666',
    fontFamily: 'RobotoRegular',
  },
  value: {
    fontSize: 15,
    color: '#1A1A1A',
    fontFamily: 'RobotoMedium',
  },
  surgeLabel: {
    color: '#FF6B6B',
  },
  surgeValue: {
    color: '#FF6B6B',
  },
  discountLabel: {
    color: tw.color('base-green') || '#3C8F7C',
  },
  discountValue: {
    color: tw.color('base-green') || '#3C8F7C',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 8,
  },
  totalRow: {
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: 'RobotoBold',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: tw.color('base-green') || '#3C8F7C',
    fontFamily: 'RobotoBold',
  },
});
