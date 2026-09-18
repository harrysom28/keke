import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  TextInput,
} from "react-native";

function windowHeightNow(): number {
  return Dimensions.get("window").height;
}

/**
 * Visible height above the keyboard. `keyboardHeight` must be the overlay
 * inset from `useKeyboardInset` (0 when Android already resized the window).
 */
export function heightAboveKeyboard(
  windowHeight: number,
  keyboardHeight: number
): number {
  if (keyboardHeight <= 0) {
    return windowHeight;
  }
  return Math.max(240, windowHeight - keyboardHeight);
}

/**
 * How much of the window the keyboard actually covers.
 *
 * `endCoordinates.height` is the keyboard's own height even when the keyboard
 * sits off-screen — with a hardware keyboard attached iOS reports a full-size
 * keyboard at `screenY === windowHeight`, covering nothing. Measure the overlap
 * with the window instead so a keyboard that is not drawn contributes 0.
 */
function keyboardOverlap(event: KeyboardEvent): number {
  const end = event.endCoordinates;
  if (!end) return 0;
  return typeof end.screenY === "number"
    ? Math.max(0, windowHeightNow() - end.screenY)
    : end.height ?? 0;
}

/** Top edge of the keyboard in window coordinates. */
function keyboardTop(event: KeyboardEvent): number {
  return windowHeightNow() - keyboardOverlap(event);
}

/**
 * Bottom offset while the keyboard overlays the window.
 * Returns 0 when `adjustResize` already shrunk the window — do not pad again.
 *
 * Edge-to-edge Android does not shrink the window; the IME sits on top.
 * Shrinking a bottom-anchored sheet in that mode only moves the field down
 * into the keyboard. Callers should pad/lift by this inset instead.
 */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);
  const baselineRef = useRef(windowHeightNow());
  const kbHeightRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      kbHeightRef.current = 0;
      baselineRef.current = windowHeightNow();
      return;
    }

    const applyInset = (kbHeight: number) => {
      kbHeightRef.current = kbHeight;
      if (kbHeight <= 0) {
        setInset(0);
        baselineRef.current = windowHeightNow();
        return;
      }
      const shrunkBy = Math.max(0, baselineRef.current - windowHeightNow());
      if (Platform.OS === "android" && shrunkBy >= kbHeight * 0.45) {
        setInset(0);
        return;
      }
      setInset(kbHeight);
    };

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      const kb = keyboardOverlap(e);
      requestAnimationFrame(() => applyInset(kb));
    };
    const onHide = () => applyInset(0);
    const onFrame = (e: KeyboardEvent) => {
      const kb = keyboardOverlap(e);
      if (kb > 0) applyInset(kb);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    const frameSub =
      Platform.OS === "android"
        ? Keyboard.addListener("keyboardDidChangeFrame", onFrame)
        : { remove: () => {} };
    const dimSub = Dimensions.addEventListener("change", ({ window }) => {
      if (kbHeightRef.current <= 0) {
        baselineRef.current = window.height;
        return;
      }
      applyInset(kbHeightRef.current);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      frameSub.remove();
      dimSub.remove();
      setInset(0);
    };
  }, [enabled]);

  return inset;
}

/**
 * Gap kept between the focused field and the top of the keyboard. Scrollers pad
 * by this much on top of the IME inset so the last field can still clear it.
 */
export const FOCUS_REVEAL_GAP = 20;

/** How often to notice that focus moved to another field while the IME stays up. */
const FOCUS_POLL_MS = 250;

/**
 * Scrolls the focused `TextInput` into the band above the keyboard.
 *
 * Padding a scroller for the IME only makes room at the bottom — it does not
 * move the field. iOS scrolls the first responder up by itself; Android never
 * does, so a field below the keyboard stays hidden there. Runs on both
 * platforms and no-ops when the field is already visible.
 *
 * Spread the returned props onto the `ScrollView` that owns `scrollRef`.
 */
export function useFocusedInputReveal(
  scrollRef: React.RefObject<ScrollView | null>
): {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
} {
  const offsetRef = useRef(0);
  const keyboardTopRef = useRef(0);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
    },
    []
  );

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout>[] = [];
    let poll: ReturnType<typeof setInterval> | null = null;
    let focusedInput: unknown = null;

    const reveal = () => {
      const scroller = scrollRef.current;
      const focused = TextInput.State.currentlyFocusedInput();
      if (!scroller || !focused || keyboardTopRef.current <= 0) return;
      focused.measureInWindow((_x, y, _width, height) => {
        if (!Number.isFinite(y) || !Number.isFinite(height)) return;
        const hidden =
          y + height + FOCUS_REVEAL_GAP - keyboardTopRef.current;
        if (hidden <= 0) return;
        scroller.scrollTo({
          y: Math.max(0, offsetRef.current + hidden),
          animated: true,
        });
      });
    };

    const clearPending = () => {
      pending.forEach(clearTimeout);
      pending = [];
    };

    // Measure after the IME inset has been padded in and laid out, then once
    // more in case the keyboard was still animating.
    const scheduleReveal = () => {
      clearPending();
      pending = [80, 280].map((delay) => setTimeout(reveal, delay));
    };

    const onShow = (event: KeyboardEvent) => {
      keyboardTopRef.current = keyboardTop(event);
      focusedInput = TextInput.State.currentlyFocusedInput();
      scheduleReveal();
      if (poll) return;
      // Tapping the next field while the IME stays up emits no keyboard event.
      poll = setInterval(() => {
        const focused = TextInput.State.currentlyFocusedInput();
        if (focused === focusedInput) return;
        focusedInput = focused;
        if (focused) scheduleReveal();
      }, FOCUS_POLL_MS);
    };

    const onHide = () => {
      keyboardTopRef.current = 0;
      focusedInput = null;
      clearPending();
      if (poll) {
        clearInterval(poll);
        poll = null;
      }
    };

    const onFrame = (event: KeyboardEvent) => {
      if (keyboardTopRef.current <= 0) return;
      keyboardTopRef.current = keyboardTop(event);
      scheduleReveal();
    };

    const showSub = Keyboard.addListener("keyboardDidShow", onShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", onHide);
    const frameSub =
      Platform.OS === "android"
        ? Keyboard.addListener("keyboardDidChangeFrame", onFrame)
        : { remove: () => {} };

    return () => {
      showSub.remove();
      hideSub.remove();
      frameSub.remove();
      onHide();
    };
  }, [scrollRef]);

  return { onScroll, scrollEventThrottle: 16 };
}

/** Pixel height for a closed-keyboard @devvie/bottom-sheet that was sized as a window fraction. */
export function windowHeightRatio(ratio: number): number {
  return Math.round(Dimensions.get("window").height * ratio);
}

/**
 * @devvie/bottom-sheet layout: grow the sheet by the overlay inset and pad the
 * bottom so fields stay in the visible band. Do not only shrink height — that
 * keeps `bottom: 0` behind the IME and slides the input into the keyboard.
 */
export function useKeyboardSheetLayout(
  baseHeight: number,
  enabled = true,
  minHeight = 280
): { height: number; paddingBottom: number } {
  const keyboardInset = useKeyboardInset(enabled);
  if (keyboardInset <= 0) {
    return { height: baseHeight, paddingBottom: 0 };
  }
  const visibleCap = Math.max(
    minHeight,
    heightAboveKeyboard(windowHeightNow(), keyboardInset) - 8
  );
  const visible = Math.min(Math.max(baseHeight, minHeight), visibleCap);
  return {
    height: visible + keyboardInset,
    paddingBottom: keyboardInset,
  };
}

/**
 * Outer sheet height only. Prefer `useKeyboardSheetLayout` so padding is applied.
 */
export function useKeyboardAwareSheetHeight(
  baseHeight: number,
  enabled = true,
  minHeight = 280
): number {
  return useKeyboardSheetLayout(baseHeight, enabled, minHeight).height;
}
