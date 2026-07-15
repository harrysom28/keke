import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import { LocationDisclosureModal } from "@/components/LocationDisclosureModal";
import { AuthState } from "@/store/AuthSlice";
import {
  clearLocationDisclosurePending,
  getPendingLocationDisclosure,
  setLocationDisclosureResponse,
  shouldAutoShowLocationDisclosure,
  subscribeLocationDisclosureRequests,
} from "@/utils/locationDisclosure";
import {
  ensureForegroundLocationAccess,
  type LocationAccessPurpose,
} from "@/utils/locationPermission";
import { resumeLocationAfterDisclosure, skipAutoLocationPromptAfterDisclosureDeny } from "@/hooks/useCurrentLocation";
import notificationManager from "@/services/notificationManager";
import { tryPromptAndRegisterNotifications } from "@/utils/notifications";

const NOTIFICATION_PROMPT_AFTER_LOCATION_MS = 800;

function scheduleNotificationPromptAfterLocationFlow(): void {
  setTimeout(() => {
    void tryPromptAndRegisterNotifications(() =>
      notificationManager.registerFcmToken()
    );
  }, NOTIFICATION_PROMPT_AFTER_LOCATION_MS);
}

/**
 * Shows the prominent location disclosure before the OS location permission
 * dialog. Triggered after signup/driver registration (pending flag), after
 * login (permission still undetermined and disclosure never accepted), and on
 * demand from permission flows via requestLocationDisclosure().
 */
export function LocationDisclosureHost() {
  const { token, user } = useSelector(AuthState);
  const role = user?.profile?.role;
  const [visible, setVisible] = useState(false);
  const [purpose, setPurpose] = useState<LocationAccessPurpose>("rider");
  const handlingRef = useRef(false);
  const defaultPurpose: LocationAccessPurpose =
    role === "driver" ? "driver" : "rider";

  const checkNeeded = useCallback(async () => {
    if (!token || handlingRef.current) {
      return;
    }
    const pending = await getPendingLocationDisclosure();
    if (pending) {
      setPurpose(pending);
      setVisible(true);
      return;
    }
    // Login path: no pending flag, but the OS permission was never requested
    // and the user has never answered the disclosure.
    if (await shouldAutoShowLocationDisclosure()) {
      setPurpose(defaultPurpose);
      setVisible(true);
    }
  }, [token, defaultPurpose]);

  useEffect(() => {
    if (!token) {
      setVisible(false);
      return;
    }
    void checkNeeded();
  }, [token, checkNeeded]);

  useEffect(() => {
    if (!token) {
      return;
    }
    return subscribeLocationDisclosureRequests((requestedPurpose) => {
      if (handlingRef.current) {
        return;
      }
      setPurpose(requestedPurpose);
      setVisible(true);
    });
  }, [token]);

  const finish = useCallback(async () => {
    handlingRef.current = true;
    setVisible(false);
    await clearLocationDisclosurePending();
    handlingRef.current = false;
  }, []);

  const onDeny = useCallback(() => {
    skipAutoLocationPromptAfterDisclosureDeny();
    void setLocationDisclosureResponse("denied");
    void finish().then(() => {
      scheduleNotificationPromptAfterLocationFlow();
    });
  }, [finish]);

  const onAllow = useCallback(async () => {
    handlingRef.current = true;
    setVisible(false);
    try {
      await setLocationDisclosureResponse("accepted");
      await ensureForegroundLocationAccess(purpose, { showRationale: false });
      await resumeLocationAfterDisclosure(purpose);
    } catch (e) {
      console.warn("Location permission request after disclosure failed:", e);
    } finally {
      await clearLocationDisclosurePending();
      handlingRef.current = false;
      scheduleNotificationPromptAfterLocationFlow();
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
