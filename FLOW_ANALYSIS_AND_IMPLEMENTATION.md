# Flow Analysis & Implementation Plan

## Current Flow Analysis

### Step-by-Step Current Flow:

**Step 1: Location Selection** (`LocationView`)
- User selects pickup location (defaults to current location)
- User selects dropoff/destination
- Proceeds to Step 2

**Step 2: Vehicle Selection** (`SelectVehicleView`)
- ✅ Fetches all vehicle types from API
- ✅ Fetches pricing for each vehicle (if origin/destination exist)
- ✅ Displays vehicles in linear list format
- ✅ Shows vehicle icon, name, description, and price
- ⚠️ **Currently**: Entire card is clickable and immediately proceeds to Step 3
- Flow: `action(vehicle)` → Sets vehicle in Redux → Sets payment_type to "Cash" → Sets ride status → Goes to Step 3

**Step 3: Driver Search** (`SearchView`)
- Searches for available drivers near pickup location
- Shows loading animation
- Proceeds to Step 4 when drivers found

### Current Implementation Issues:

1. **No "Select" button** - User clicks entire card, which might be confusing
2. **No visual indication** - Card doesn't clearly show it's selectable
3. **No payment selection** - Payment is hardcoded to "Cash" (might be fine)
4. **No confirmation** - Immediate transition to driver search

---

## Desired Flow (Based on Image)

**Step 1: Location Selection** 
- ✅ Same as current

**Step 2: Vehicle Selection with Select Button**
- Display vehicles with:
  - Vehicle icon (car image)
  - Vehicle name (e.g., "Bolt")
  - Meta info: "4 min" • person icon "4" • "Mid-size cars"
  - Price: Discounted price (₦1,800) and original price (₦2,000) with strikethrough
- **Each vehicle card should have:**
  - A prominent "Select [Vehicle Name]" button at the bottom
  - Payment selector (optional, can be added later)
  - Schedule button (optional, can be added later)
- On clicking "Select" → Proceed to Step 3

**Step 3: Driver Search**
- ✅ Same as current

---

## Implementation Plan

### Option 1: Simple "Select" Button (Recommended)

**Changes needed in `selectVehicle.tsx`:**

1. **Add "Select" button to each vehicle card**
   - Place button inside each card or at the bottom
   - Button text: "Select [Vehicle Name]"
   - Style: Green button matching app theme

2. **Update card layout:**
   - Make card non-clickable (remove `onPress` from Pressable)
   - Keep card as container, button handles action

3. **Add vehicle metadata:**
   - Show "4 min" (pickup time)
   - Show person icon with capacity
   - Show "Mid-size cars" (description)

4. **Optional: Add promo banner** (if promo is applied)

**Code Structure:**
```tsx
<View style={styles.vehicleCard}>
  <Image ... />
  <View style={styles.vehicleInfo}>
    <Text>Bolt</Text>
    <View>4 min • 👤 4 • Mid-size cars</View>
  </View>
  <View style={styles.priceContainer}>
    <Text>₦1,800</Text>
    <Text style={styles.oldPrice}>₦2,000</Text>
  </View>
</View>
<TouchableOpacity style={styles.selectButton} onPress={() => action(vehicle)}>
  <Text>Select Bolt</Text>
</TouchableOpacity>
```

### Option 2: Full Card Layout with Select Button (Like Image)

**Changes needed:**

1. **Card layout similar to image:**
   - Larger card with more spacing
   - Vehicle icon on left
   - Vehicle name, meta info, description in center
   - Price on right
   - Select button below card or inside card

2. **Add promo banner** (if applicable)

3. **Add payment and schedule buttons** (optional, can be simplified)

---

## Recommended Implementation (Option 1 - Simpler)

### Step 1: Update `selectVehicle.tsx`

**Add to Vehicle Card:**
- Vehicle metadata (pickup time, capacity, description)
- Price with discount support
- "Select" button at bottom or inside card

**Update structure:**
```tsx
<View style={styles.vehicleCard}>
  {/* Icon */}
  {/* Info with metadata */}
  {/* Price */}
  {/* Select Button */}
</View>
```

### Step 2: Update `findRide.tsx` (if needed)

**Current flow is correct:**
- Step 1 → Step 2 → Step 3 ✅
- Action in Step 2 already sets vehicle and proceeds ✅

**No changes needed** - The action already:
- Sets vehicle in Redux
- Sets payment_type to "Cash"
- Sets vehicle_type_id
- Activates ride status
- Proceeds to Step 3

---

## Implementation Details

### Vehicle Metadata to Show:
- **Pickup time**: "4 min" (hardcoded for now, or from API)
- **Capacity**: Person icon + number (from vehicle data or default 4)
- **Description**: "Mid-size cars" (from vehicle data or default)

### Pricing Display:
- **Original price**: Strikethrough if discount applied
- **Final price**: Prominently displayed
- **Promo banner**: Optional (if 10% discount is applied)

### Select Button:
- **Text**: "Select [Vehicle Name]" (e.g., "Select Bolt")
- **Style**: Green button, full width or inside card
- **Action**: Calls `action(vehicle)` which proceeds to driver search

---

## Files to Modify

1. ✅ `mobile/components/find-ride/selectVehicle.tsx` - Add Select button and metadata
2. ✅ `mobile/app/(app)/(tabs)/(home)/_modals/findRide.tsx` - Already correct, no changes needed

---

## Summary

**Current State:**
- ✅ Vehicles are fetched with pricing
- ✅ Displayed in linear list
- ⚠️ Entire card is clickable (needs Select button)

**What to Change:**
- ✅ Add "Select" button to each vehicle card
- ✅ Add vehicle metadata (pickup time, capacity, description)
- ✅ Support discount pricing display
- ✅ Remove card-wide click, make Select button handle action

**Flow Remains:**
- Step 1: Location → Step 2: Vehicle (with Select button) → Step 3: Driver Search
