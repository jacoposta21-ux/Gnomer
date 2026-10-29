// River fish. weight = how common; zone = width (0..1) of the green zone in the reeling bar
// (smaller is harder); speed = how fast the marker moves. night: only after 18:00. rain: more common in rain.
export const FISH = [
  { id: 'mudminnow', weight: 50, zone: 0.34, speed: 0.9 },
  { id: 'river_perch', weight: 30, zone: 0.26, speed: 1.2 },
  { id: 'silver_eel', weight: 15, zone: 0.2, speed: 1.5, night: true },
  { id: 'golden_carp', weight: 5, zone: 0.14, speed: 1.8, rain: true },
];

export const FISHING = {
  energy: 3,        // per cast
  wait: [1.5, 4.5], // seconds before a bite
  bite: 0.9,        // seconds to react to "!"
  rodPrice: 150,
  catDays: 2,       // a cat fed a fish follows you for this many days
  catPets: 3,       // ... and can be petted this many times a day
};
