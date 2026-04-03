import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { DriverMapItem } from "../types/driver";

export interface DriverRow {
  id: string;
  latitude: number;
  longitude: number;
  heading: number;
  is_active: boolean;
  updated_at: string;
}

type Listener = (drivers: DriverMapItem[]) => void;

const DEFAULT_HEADING = 0;

function smoothCoordinate(
  prev: number,
  next: number,
  factor: number
): number {
  return prev + (next - prev) * factor;
}

function applySmoothing(
  current: DriverMapItem[],
  incoming: DriverMapItem[],
  factor: number
): DriverMapItem[] {
  const byId = new Map(current.map((d) => [d.id, d]));
  return incoming.map((d) => {
    const prev = byId.get(d.id);
    if (!prev) return d;
    return {
      ...d,
      latitude: smoothCoordinate(prev.latitude, d.latitude, factor),
      longitude: smoothCoordinate(prev.longitude, d.longitude, factor),
      heading: smoothCoordinate(prev.heading, d.heading, factor),
    };
  });
}

function getSupabaseClient(): ReturnType<typeof createClient> | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key);
}

class DriverEngineClass {
  private listeners = new Set<Listener>();
  private drivers: DriverMapItem[] = [];
  private channel: RealtimeChannel | null = null;
  private supabase: ReturnType<typeof createClient> | null = null;
  private smoothingFactor = 0.25;

  subscribe(callback: Listener): () => void {
    this.listeners.add(callback);
    callback(this.drivers);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private emit(): void {
    const list = [...this.drivers];
    this.listeners.forEach((cb) => {
      try {
        cb(list);
      } catch (e) {
        // no-op
      }
    });
  }

  private mapRow(row: DriverRow): DriverMapItem {
    return {
      id: row.id,
      latitude: row.latitude,
      longitude: row.longitude,
      heading: row.heading ?? DEFAULT_HEADING,
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  private setDrivers(next: DriverMapItem[]): void {
    this.drivers = applySmoothing(this.drivers, next, this.smoothingFactor);
    this.emit();
  }

  start(): void {
    if (this.channel) return;
    this.supabase = getSupabaseClient();
    if (!this.supabase) return;
    this.channel = this.supabase
      .channel("drivers-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drivers",
          filter: "is_active=eq.true",
        },
        (payload) => {
          const row = payload.new as DriverRow;
          if (!row || !row.is_active) return;
          const item = this.mapRow(row);
          const next = this.drivers.filter((d) => d.id !== item.id);
          next.push(item);
          this.setDrivers(next);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && this.supabase) {
          this.supabase
            .from("drivers")
            .select("id,latitude,longitude,heading,is_active,updated_at")
            .eq("is_active", true)
            .then(({ data }) => {
              if (data && Array.isArray(data)) {
                this.setDrivers(
                  (data as DriverRow[]).map((r) => this.mapRow(r))
                );
              }
            });
        }
      });
  }

  stop(): void {
    if (this.channel && this.supabase) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.drivers = [];
    this.emit();
  }

  getDrivers(): DriverMapItem[] {
    return [...this.drivers];
  }
}

export const DriverEngine = new DriverEngineClass();
