import { createRng } from './rng.mjs';

export const SHOP_ITEMS = {
  dynamite: { label: 'Dynamite', basePrice: 100, duration: 'inventory' },
  strength_drink: { label: 'Strength Drink', basePrice: 250, duration: 'next-level' },
  lucky_clover: { label: 'Lucky Clover', basePrice: 200, duration: 'next-level' },
  diamond_polish: { label: 'Diamond Polish', basePrice: 300, duration: 'next-level' },
  rock_book: { label: "Rock Collector's Book", basePrice: 150, duration: 'next-level' },
  magic_clock: { label: 'Magic Clock', basePrice: 350, duration: 'next-level' }
};

export function generateShopPrices(seed, level) {
  const rng = createRng(seed ^ (level * 7919));
  const prices = {};
  for (const [id, item] of Object.entries(SHOP_ITEMS)) {
    const variance = 0.65 + rng.next() * 0.7;
    prices[id] = Math.max(1, Math.round(item.basePrice * variance));
  }
  return prices;
}
