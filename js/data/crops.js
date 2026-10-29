// days = watered days needed to mature. stages = number of sprites (seed .. mature).
export const CROPS = {
  turnip:  { days: 3, produce: 'turnip', stages: 4 },
  garlic:  { days: 4, produce: 'garlic', stages: 4 },
  pumpkin: { days: 7, produce: 'pumpkin', stages: 5 },
};

// Debris found in the overgrown field. energy = scythe cost to clear.
export const DEBRIS = {
  weeds: { energy: 1, weight: 5 },
  twigs: { energy: 1, weight: 3 },
  bramble: { energy: 2, weight: 2 },
};
