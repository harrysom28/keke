import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import { LocationDisclosureModal } from "@/components/LocationDisclosureModal";
import { AuthState } from "@/store/AuthSlice";
import {
  clearLocationDisclosurePending,
  getPendingLocationDisclosure,
} from "@/utils/locationDisclosure";
import {
  ensureForegroundLocationAccess,
  type LocationAccessPurpose,
} from "@/utils/locationPermission";
import { resumeLocationAfterDisclosure, skipAutoLocationPromptAfterDisclosureDeny } from "@/hooks/useCurrentLocation";

/**
 * Shows the location data usage disclosure immediately after signup, before the
 * OS location permission dialog is triggered.
 */
export function LocationDisclosureHost() {
  const { token } = useSelector(AuthState);
  const [visible, setVisible] = useState(false);
  const [purpose, setPurpose] = useState<LocationAccessPurpose>("rider");
  const handlingRef = useRef(false);

  const checkPending = useCallback(async () => {
    if (!token || handlingRef.current) {
      return;
    }
    const pending = await getPendingLocationDisclosure();
    if (!pending) {
      return;
    }
    setPurpose(pending);
    setVisible(true);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setVisible(false);
      return;
    }
    void checkPending();
  }, [token, checkPending]);

  const finish = useCallback(async () => {
    handlingRef.current = true;
    setVisible(false);
    await clearLocationDisclosurePending();
    handlingRef.current = false;
  }, []);

  const onDeny = useCallback(() => {
    skipAutoLocationPromptAfterDisclosureDeny();
    void finish();
  }, [finish]);

  const onAllow = useCallback(async () => {
    handlingRef.current = true;
    setVisible(false);
    try {
      await ensureForegroundLocationAccess(purpose, { showRationale: false });
      await resumeLocationAfterDisclosure(purpose);
    } catch (e) {
      console.warn("Location permission request after disclosure failed:", e);
    } finally {
      await clearLocationDisclosurePending();
      handlingRef.current = false;
    }
  }, [purpose]);

  if (!token) {
    return null;
  }

  return (
    <LocationDisclosureModal
      visible={visible}
      purpose={purpose}
      onAllow={() => {
        void onAllow();
      }}
      onDeny={onDeny}
    />
  );
}
