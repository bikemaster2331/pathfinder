import { create } from 'zustand';

export const useMapStore = create((set) => ({
  viewport: {
    latitude: 13.79,
    longitude: 124.23,
    zoom: 9,
  },
  setViewport: (viewport) => set({ viewport }),
  destinations: [],
  addDestination: (destination) =>
    set((state) => ({
      destinations: [...state.destinations, destination],
    })),
  removeDestination: (id) =>
    set((state) => ({
      destinations: state.destinations.filter((d) => d.id !== id),
    })),
  clearDestinations: () => set({ destinations: [] }),
}));
