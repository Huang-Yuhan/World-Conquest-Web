import { createMapData, type MapData } from './MapData.ts';
import type { MapDefinition } from './MapDefinition.ts';

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

export async function loadMap(mapId: string, signal?: AbortSignal): Promise<MapData> {
  if (!SAFE_ID.test(mapId)) throw new Error('非法地图 ID');
  const response = await fetch(`${import.meta.env.BASE_URL}maps/${mapId}/map.json`, { signal });
  if (!response.ok) throw new Error(`地图加载失败：${mapId} (${response.status})`);
  const raw = await response.json() as MapDefinition;
  if (raw.id !== mapId) throw new Error(`地图 ID 不匹配：${mapId}`);
  return createMapData(raw);
}
