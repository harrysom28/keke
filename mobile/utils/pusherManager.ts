/**
 * Pusher Manager - Handles Pusher channel subscriptions and prevents duplicates
 */

interface Subscription {
  channel: any;
  eventName: string;
  callback: Function;
}

class PusherManager {
  private subscriptions = new Map<string, Subscription>();
  private pusher: any = null;
  private initialized = false;

  /**
   * Initialize the Pusher manager with a Pusher instance
   */
  initialize(pusher: any) {
    if (this.initialized) {
      console.log('⚠️ PusherManager already initialized');
      return;
    }
    
    this.pusher = pusher;
    this.initialized = true;
    
    if (__DEV__) {
      console.log('✅ PusherManager initialized');
    }
  }

  /**
   * Subscribe to a Pusher channel and event
   * Returns a cleanup function to unsubscribe
   */
  subscribe(
    channelName: string, 
    eventName: string, 
    callback: Function
  ): () => void {
    if (!this.initialized || !this.pusher) {
      console.error('❌ PusherManager not initialized. Call initialize() first.');
      return () => {};
    }

    const key = `${channelName}:${eventName}`;

    // Check if already subscribed
    if (this.subscriptions.has(key)) {
      if (__DEV__) {
        console.log(`⏭️ Already subscribed to ${key}, skipping`);
      }
      return () => {}; // Return empty cleanup
    }

    try {
      if (__DEV__) {
        console.log(`Attempting to subscribe to Pusher ${channelName}`);
      }

      const channel = this.pusher.subscribe(channelName);
      channel.bind(eventName, callback);
      
      this.subscriptions.set(key, { channel, eventName, callback });

      // Return cleanup function
      return () => {
        this.unsubscribe(channelName, eventName);
      };
    } catch (error) {
      console.error(`❌ Failed to subscribe to ${channelName}:`, error);
      return () => {};
    }
  }

  /**
   * Unsubscribe from a specific channel/event or entire channel
   */
  unsubscribe(channelName: string, eventName?: string) {
    if (!this.initialized) return;

    if (eventName) {
      // Unsubscribe from specific event
      const key = `${channelName}:${eventName}`;
      const sub = this.subscriptions.get(key);
      
      if (sub) {
        try {
          if (__DEV__) {
            console.log(`Unsubscribing from Pusher channel: ${key}`);
          }
          sub.channel.unbind(eventName, sub.callback);
          this.subscriptions.delete(key);
        } catch (error) {
          console.error(`Error during Pusher unsubscription:`, error);
        }
      }
    } else {
      // Unsubscribe from all events on this channel
      const keysToDelete: string[] = [];
      
      for (const [key, sub] of this.subscriptions.entries()) {
        if (key.startsWith(`${channelName}:`)) {
          try {
            sub.channel.unbind(sub.eventName, sub.callback);
            keysToDelete.push(key);
          } catch (error) {
            console.error(`Error during Pusher unsubscription:`, error);
          }
        }
      }
      
      keysToDelete.forEach(key => this.subscriptions.delete(key));
      
      try {
        this.pusher.unsubscribe(channelName);
      } catch (error) {
        console.error(`Error unsubscribing from channel ${channelName}:`, error);
      }
    }
  }

  /**
   * Unsubscribe from all channels
   */
  unsubscribeAll() {
    if (!this.initialized) return;

    if (__DEV__) {
      console.log(`🧹 Unsubscribing from all Pusher channels (${this.subscriptions.size})`);
    }

    for (const [key, sub] of this.subscriptions.entries()) {
      try {
        sub.channel.unbind(sub.eventName, sub.callback);
      } catch (error) {
        console.error(`Error unbinding ${key}:`, error);
      }
    }
    
    this.subscriptions.clear();
  }

  /**
   * Get subscription statistics
   */
  getStats() {
    return {
      activeSubscriptions: this.subscriptions.size,
      channels: Array.from(this.subscriptions.keys()),
      initialized: this.initialized,
    };
  }

  /**
   * Check if subscribed to a channel/event
   */
  isSubscribed(channelName: string, eventName?: string): boolean {
    if (eventName) {
      return this.subscriptions.has(`${channelName}:${eventName}`);
    }
    
    // Check if any subscription exists for this channel
    for (const key of this.subscriptions.keys()) {
      if (key.startsWith(`${channelName}:`)) {
        return true;
      }
    }
    return false;
  }
}

export const pusherManager = new PusherManager();
