// Palm City — shared constants: view, city geometry, palette, save key.
// Everything geometric derives from the road/block grid so world, renderer
// and tests all agree on the shape of the city.

export const STEP = 1 / 60;
export const VIEW_W = 1280;
export const VIEW_H = 720;

// Road grid: COLS x ROWS city blocks separated by roads on every side.
export const ROAD = 92;
export const BLOCK_W = 300;
export const BLOCK_H = 220;
export const COLS = 13;
export const ROWS = 10;
export const SIDEWALK = 13;

export const CITY_W = COLS * BLOCK_W + (COLS + 1) * ROAD;
export const CITY_H = ROWS * BLOCK_H + (ROWS + 1) * ROAD;

// East edge: a sand beach, then open ocean.
export const BEACH_W = 360;
export const OCEAN_W = 620;
export const WORLD_W = CITY_W + BEACH_W + OCEAN_W;
export const WORLD_H = CITY_H;

export const SAVE_KEY = 'palm-city-save-v1';

// Sun-soaked palette.
export const COLORS = {
  asphalt: '#41474f',
  asphaltEdge: '#33383f',
  laneMark: '#f7dc6f',
  crosswalk: '#e9e6da',
  sidewalk: '#e9dfc8',
  blockGround: '#d9cfb4',
  grass: '#7cc45f',
  grassDark: '#63a84b',
  parkPath: '#efe3bd',
  sand: '#f5e0a0',
  sandDark: '#ecd28c',
  ocean: '#2196b8',
  oceanDeep: '#176a8c',
  foam: '#eafcff',
  palmTrunk: '#8a6b45',
  palmLeaf: '#2f9e57',
  palmLeafDark: '#258548',
  hudPanel: 'rgba(10, 18, 28, 0.62)',
  hudText: '#ffffff',
  gold: '#ffd94d',
  danger: '#ff5347',
  policeBlue: '#2470c9',
  policeRed: '#e83a30',
};

// Centre x of the i-th vertical road (i in 0..COLS) and y of the j-th
// horizontal road (j in 0..ROWS).
export function roadX(i) { return i * (BLOCK_W + ROAD) + ROAD / 2; }
export function roadY(j) { return j * (BLOCK_H + ROAD) + ROAD / 2; }

// Top-left corner of block (col,row).
export function blockX(col) { return ROAD + col * (BLOCK_W + ROAD); }
export function blockY(row) { return ROAD + row * (BLOCK_H + ROAD); }

export const DISTRICTS = ['Downtown', 'Palm Heights', 'Portside', 'Coral Beach'];

export function districtAt(x, y) {
  if (x >= CITY_W - 2 * (BLOCK_W + ROAD)) return 'Coral Beach';
  if (y >= CITY_H * 0.60 && x >= CITY_W * 0.36) return 'Portside';
  if (x < CITY_W * 0.38 && y < CITY_H * 0.58) return 'Downtown';
  return 'Palm Heights';
}
