export interface DriverLocation {
  id: string;
  latitude: number;
  longitude: number;
  heading: number;
  is_active: boolean;
  updated_at: string;
}

export interface DriverMapItem {
  id: string;
  latitude: number;
  longitude: number;
  heading: number;
  updatedAt: number;
}
