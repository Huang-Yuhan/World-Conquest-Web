import type { ScenarioDefinition } from './ScenarioDefinition.ts';

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

export async function loadScenario(id: string, signal?: AbortSignal): Promise<ScenarioDefinition> {
  if (!SAFE_ID.test(id)) throw new Error('非法剧本 ID');
  const response = await fetch(`${import.meta.env.BASE_URL}scenarios/${id}.json`, { signal });
  if (!response.ok) throw new Error(`剧本加载失败：${id} (${response.status})`);
  const data = await response.json() as ScenarioDefinition;
  if (data.id !== id) throw new Error(`剧本 ID 不匹配：${id}`);
  return data;
}
