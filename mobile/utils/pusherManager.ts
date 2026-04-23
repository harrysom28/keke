/**
 * Pusher Manager — subscriptions for @pusher/pusher-websocket-react-native.
 *
 * The native client uses `pusher.subscribe({ channelName, onEvent, ... })` (async).
 * It does NOT return a channel with `.bind()`; the old pusher-js pattern caused
 * `channel.bind is not a function` and duplicate native subscriptions.
 */

import type { Pusher, PusherEvent } from "@pusher/pusher-websocket-react-native";

type HandlerEntry = { channelName: string; eventName: string; callback: Function };

function isPusherProtocolEvent(eventName: string | undefined): boolean {
  if (!eventName) return false;
  if (eventName.startsWith("pusher:")) return true;
  if (eventName.startsWith("pusher_internal:")) return true;
  return false;
}

function parseEventData(data: unknown): any {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

class PusherManager {
  /** subscription id -> entry */
  private subscriptions = new Map<string, HandlerEntry>();
  /** channel -> event -> callbacks */
  private channelHandlers = new Map<string, Map<string, Set<Function>>>();
  /** one in-flight native subscribe per channel */
  private channelBootstraps = new Map<string, Promise<void>>();
  private pusher: Pusher | null = null;
  private initialized = false;
  private nextSubId = 0;

  initialize(pusher: Pusher) {
    if (this.initialized) {
      if (__DEV__) {
        console.log("⚠️ PusherManager already initialized");
      }
      return;
    }
    this.pusher = pusher;
    this.initialized = true;
    if (__DEV__) {
      console.log("✅ PusherManager initialized");
    }
  }

  private ensureHandlerMaps(channelName: string, eventName: string): Set<Function> {
    let byEvent = this.channelHandlers.get(channelName);
    if (!byEvent) {
      byEvent = new Map();
      this.channelHandlers.set(channelName, byEvent);
    }
    let set = byEvent.get(eventName);
    if (!set) {
      set = new Set();
      byEvent.set(eventName, set);
    }
    return set;
  }

  private channelHasAnyHandlers(channelName: string): boolean {
    const byEvent = this.channelHandlers.get(channelName);
    if (!byEvent) return false;
    for (const s of byEvent.values()) {
      if (s.size > 0) return true;
    }
    return false;
  }

  private dispatchEvent(channelName: string, event: PusherEvent) {
    if (isPusherProtocolEvent(event.eventName)) return;
    const handlers = this.channelHandlers.get(channelName)?.get(event.eventName);
    if (!handlers?.size) return;
    const data = parseEventData(event.data);
    handlers.forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error(`[Pusher] handler error on ${channelName} ${event.eventName}:`, e);
      }
    });
  }

  private startChannelIfNeeded(channelName: string) {
    if (!this.pusher || !this.initialized) return;
    if (this.channelBootstraps.has(channelName)) return;

    const boot = (async () => {
      try {
        await this.pusher!.subscribe({
          channelName,
          onSubscriptionSucceeded: () => {
            if (__DEV__) {
              console.log(`✅ Pusher subscribed: ${channelName}`);
            }
          },
          onSubscriptionError: (_channel: string, message: string, type: string) => {
            console.warn(`[Pusher] subscription error ${channelName}:`, message, type);
          },
          onEvent: (event: PusherEvent) => {
            if (event.channelName !== channelName) return;
            this.dispatchEvent(channelName, event);
          },
        });
      } catch (err) {
        console.error(`[Pusher] failed to subscribe ${channelName}:`, err);
      } finally {
        this.channelBootstraps.delete(channelName);
      }
    })();

    this.channelBootstraps.set(channelName, boot);
  }

  /**
   * Attach one listener (internal). Requires initialized pusher.
   */
  private attachSubscription(channelName: string, eventName: string, callback: Function): string {
    const subId = `sub_${++this.nextSubId}`;
    this.subscriptions.set(subId, { channelName, eventName, callback });
    const set = this.ensureHandlerMaps(channelName, eventName);
    set.add(callback);
    this.startChannelIfNeeded(channelName);
    return subId;
  }

  /**
   * Subscribe to one event on a channel. Returns a cleanup that removes only this listener.
   * Multiple listeners per channel/event are allowed (each call gets its own cleanup).
   *
   * If `initialize()` has not run yet (race on cold start), retries briefly instead of
   * dropping the subscription — avoids missed ride events when components mount first.
   */
  subscribe(channelName: string, eventName: string, callback: Function): () => void {
    let subId: string | null = null;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = 50;

    const tryAttach = () => {
      if (cancelled) return;
      if (!this.initialized || !this.pusher) {
        if (attempts++ < maxAttempts) {
          timeoutId = setTimeout(tryAttach, 100);
        } else if (__DEV__) {
          console.warn(
            `[Pusher] subscribe gave up waiting for initialize(): ${channelName}:${eventName}`
          );
        }
        return;
      }
      subId = this.attachSubscription(channelName, eventName, callback);
    };

    tryAttach();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (subId) this.removeSubscription(subId);
    };
  }

  /**
   * Subscribe the same callback to multiple events in one logical registration.
   * Cleanup unsubscribes all events at once (single native channel teardown when empty).
   */
  subscribeMany(
    channelName: string,
    eventNames: readonly string[],
    callback: Function
  ): () => void {
    const cleanups = eventNames.map((en) => this.subscribe(channelName, en, callback));
    return () => {
      cleanups.forEach((c) => {
        try {
          c();
        } catch {
          // ignore
        }
      });
    };
  }

  private removeSubscription(subId: string) {
    const entry = this.subscriptions.get(subId);
    if (!entry) return;
    this.subscriptions.delete(subId);

    const { channelName, eventName, callback } = entry;
    const set = this.channelHandlers.get(channelName)?.get(eventName);
    set?.delete(callback);

    if (set && set.size === 0) {
      this.channelHandlers.get(channelName)?.delete(eventName);
    }
    const byEvent = this.channelHandlers.get(channelName);
    if (byEvent && byEvent.size === 0) {
      this.channelHandlers.delete(channelName);
    }

    if (!this.channelHasAnyHandlers(channelName) && this.pusher) {
      void this.pusher
        .unsubscribe({ channelName })
        .catch((e) => console.warn(`[Pusher] unsubscribe ${channelName}:`, e));
    }
  }

  /**
   * Legacy: unsubscribe by channel and optional event (removes ALL handlers for that event).
   */
  unsubscribe(channelName: string, eventName?: string) {
    if (!this.initialized) return;

    const idsToRemove: string[] = [];
    for (const [id, sub] of this.subscriptions.entries()) {
      if (sub.channelName !== channelName) continue;
      if (eventName != null && sub.eventName !== eventName) continue;
      idsToRemove.push(id);
    }
    idsToRemove.forEach((id) => this.removeSubscription(id));
  }

  unsubscribeAll() {
    if (!this.initialized || !this.pusher) {
      this.subscriptions.clear();
      this.channelHandlers.clear();
      this.channelBootstraps.clear();
      return;
    }

    const channelNames = new Set<string>();
    for (const sub of this.subscriptions.values()) {
      channelNames.add(sub.channelName);
    }

    this.subscriptions.clear();
    this.channelHandlers.clear();
    this.channelBootstraps.clear();

    channelNames.forEach((cn) => {
      void this.pusher!.unsubscribe({ channelName: cn }).catch(() => {});
    });
  }

  getStats() {
    return {
      activeSubscriptions: this.subscriptions.size,
      channels: [...new Set([...this.subscriptions.values()].map((s) => s.channelName))],
      initialized: this.initialized,
    };
  }

  isSubscribed(channelName: string, eventName?: string): boolean {
    for (const sub of this.subscriptions.values()) {
      if (sub.channelName !== channelName) continue;
      if (eventName != null && sub.eventName !== eventName) continue;
      return true;
    }
    return false;
  }
}

export const pusherManager = new PusherManager();
