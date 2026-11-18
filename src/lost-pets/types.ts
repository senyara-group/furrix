export type LostAlert = {
  id: string;
  reporter_id: string;
  pet_id: string;
  display_name: string;
  species: string;
  city: string;
  latitude: number;
  longitude: number;
  last_seen_at: string;
  description: string;
  instructions: string | null;
  photo_path: string | null;
  radius_km: number;
  status: "lost" | "found" | "closed";
  is_mine: boolean;
};
export type LocalNotification = {
  id: string;
  user_id: string;
  alert_id: string;
  kind: "lost_local" | "lost_sighting" | "lost_found";
  title: string;
  read_at: string | null;
  created_at: string;
};
export type LostSector = {
  user_id: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  created_at: string;
};
export type LostSighting = {
  id: string;
  alert_id: string;
  observer_id: string;
  seen_at: string;
  city: string;
  message: string;
  created_at: string;
};
export type LostForm = {
  petId: string;
  city: string;
  latitude: string;
  longitude: string;
  seenAt: string;
  description: string;
  instructions: string;
  radius: string;
  photo: boolean;
};
export type PublishLostArgs = {
  p_id: string;
  p_pet: string;
  p_city: string;
  p_lat: number;
  p_lng: number;
  p_seen: string;
  p_description: string;
  p_instructions: string;
  p_radius: number;
  p_photo?: string;
};
