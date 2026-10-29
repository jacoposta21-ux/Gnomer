// Item definitions. Display names and descriptions live in strings (item.<id>.name / .desc).
// type: tool | seed | crop | goods | charm. price = shop buy price, sell = sell/ship value.
export const ITEMS = {
  hoe:            { type: 'tool', stack: 1, energy: 2 },
  watering_can:   { type: 'tool', stack: 1, energy: 1, capacity: 20 },
  scythe:         { type: 'tool', stack: 1, energy: 1 },
  seed_turnip:    { type: 'seed', crop: 'turnip', price: 20, sell: 10, stack: 99 },
  seed_garlic:    { type: 'seed', crop: 'garlic', price: 30, sell: 15, stack: 99 },
  seed_pumpkin:   { type: 'seed', crop: 'pumpkin', price: 60, sell: 30, stack: 99 },
  turnip:         { type: 'crop', sell: 45, stack: 99, gift: true },
  garlic:         { type: 'crop', sell: 70, stack: 99, gift: true },
  pumpkin:        { type: 'crop', sell: 260, stack: 99, gift: true },
  tea_tin:        { type: 'goods', price: 60, sell: 25, stack: 99, gift: true },
  aster_bouquet:  { type: 'goods', price: 45, sell: 15, stack: 99, gift: true },
  hard_cheese:    { type: 'goods', price: 80, sell: 30, stack: 99, gift: true },
  garlic_garland: { type: 'charm', charges: 1, stack: 99 },
  pumpkin_ward:   { type: 'charm', charges: 2, stack: 99 },
};

// What the general store sells, in display order.
export const SHOP_STOCK = ['seed_turnip', 'seed_garlic', 'seed_pumpkin', 'tea_tin', 'aster_bouquet', 'hard_cheese'];
export const BACKPACK = { price: 500, size: 25 };
export const START_INVENTORY = [['hoe', 1], ['watering_can', 1], ['scythe', 1], ['seed_turnip', 8], ['seed_garlic', 4]];
export const START_MONEY = 300;
export const START_INV_SIZE = 15;
