import { useEffect, useRef } from 'react';
import { loadMap } from '../map/MapLoader.ts';
import { GameWorld } from '../gameplay/GameWorld.ts';
import { loadScenario } from '../gameplay/ScenarioLoader.ts';
import { buildRenderSnapshot } from '../gameplay/RenderSnapshotBuilder.ts';
import { MapRenderer } from './MapRenderer.ts';

/** React is only the host/composition root, not the map simulation or renderer. */
export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const abort = new AbortController();
    let renderer: MapRenderer | undefined;

    async function start() {
      // Future independent maps are selected by choosing a scenario asset.
      const scenarioId = new URLSearchParams(window.location.search).get('scenario') ?? 'asteria-1936';
      const scenario = await loadScenario(scenarioId, abort.signal);
      const map = await loadMap(scenario.mapId, abort.signal);
      if (abort.signal.aborted) return;

      const gameWorld = new GameWorld(map, scenario);
      const instance = new MapRenderer(host!, map);
      renderer = instance;
      await instance.initialize();
      if (abort.signal.aborted) return;
      instance.submitSnapshot(buildRenderSnapshot(gameWorld));
    }

    void start().catch(error => {
      if (!abort.signal.aborted) console.error('地图加载失败：', error);
    });

    return () => {
      abort.abort();
      renderer?.destroy();
    };
  }, []);

  return <div ref={hostRef} className="map-canvas" aria-label="六边形政治地图" />;
}
