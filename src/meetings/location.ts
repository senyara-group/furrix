import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

/** Déclenché seulement par une action explicite, jamais en arrière-plan. */
export async function approximateLocation() {
  if (Capacitor.isNativePlatform()) {
    const permissions = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
    if (permissions.coarseLocation !== 'granted') throw new Error('Localisation refusée');
  }
  const { coords } = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 });
  return { latitude: Math.round(coords.latitude * 100) / 100, longitude: Math.round(coords.longitude * 100) / 100 };
}
