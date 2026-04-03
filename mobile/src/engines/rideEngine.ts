import type { RideState } from "../types/ride";
import { isAllowedTransition } from "../types/ride";

type Listener = (state: RideState) => void;

class RideEngineClass {
  private state: RideState = "IDLE";
  private listeners = new Set<Listener>();

  subscribe(callback: Listener): () => void {
    this.listeners.add(callback);
    callback(this.state);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private emit(): void {
    this.listeners.forEach((cb) => {
      try {
        cb(this.state);
      } catch (e) {
        // no-op
      }
    });
  }

  getState(): RideState {
    return this.state;
  }

  setState(next: RideState): boolean {
    if (this.state === next) return true;
    if (!isAllowedTransition(this.state, next)) return false;
    this.state = next;
    this.emit();
    return true;
  }

  reset(): void {
    this.state = "IDLE";
    this.emit();
  }
}

export const RideEngine = new RideEngineClass();
