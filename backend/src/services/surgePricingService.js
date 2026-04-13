/**
 * Surge pricing — currently disabled (multiplier always 1×).
 * To restore demand/time-based surge, reintroduce supply/demand logic here (see git history).
 */
class SurgePricingService {
  async calculateSurgeMultiplier() {
    return {
      multiplier: 1.0,
      isSurged: false,
      reason: 'Normal pricing',
    };
  }

  applySurgePricing(baseFare, surgeMultiplier) {
    const m = surgeMultiplier > 0 ? surgeMultiplier : 1.0;
    const surgedFare = baseFare * m;
    return {
      baseFare,
      surgeMultiplier: m,
      finalFare: Math.round(surgedFare * 100) / 100,
      isSurged: m > 1.0,
    };
  }
}

export default new SurgePricingService();
