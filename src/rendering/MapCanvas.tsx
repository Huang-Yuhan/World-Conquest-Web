import { useEffect, useRef, useState } from 'react';
import { loadMap } from '../map/MapLoader.ts';
import { GameWorld } from '../gameplay/GameWorld.ts';
import { loadScenario } from '../gameplay/ScenarioLoader.ts';
import { buildRenderSnapshot } from '../gameplay/RenderSnapshotBuilder.ts';
import { MapRenderer } from './MapRenderer.ts';

/** React is only the host/composition root, not the map simulation or renderer. */
export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const abort = new AbortController();
    let renderer: MapRenderer | undefined;
    let gameWorld: GameWorld | undefined;
    let selectedUnitId: string | null = null;

    const onHexClick = (hexId: string): void => {
      if (abort.signal.aborted || !renderer || !gameWorld) return;
      const standingUnit = gameWorld.unitAt(hexId);
      if (standingUnit) {
        selectedUnitId = standingUnit.id;
      } else if (selectedUnitId && gameWorld.reachableFor(selectedUnitId).has(hexId)) {
        gameWorld.moveUnit(selectedUnitId, hexId);
        renderer.submitSnapshot(buildRenderSnapshot(gameWorld));
      } else {
        selectedUnitId = null;
      }
      renderer.setSelection(
        selectedUnitId,
        selectedUnitId ? [...gameWorld.reachableFor(selectedUnitId).keys()] : [],
      );
    };

    async function start() {
      // Future independent maps are selected by choosing a scenario asset.
      const scenarioId = new URLSearchParams(window.location.search).get('scenario') ?? 'asteria-1936';
      const scenario = await loadScenario(scenarioId, abort.signal);
      const map = await loadMap(scenario.mapId, abort.signal);
      if (abort.signal.aborted) return;

      gameWorld = new GameWorld(map, scenario);
      const instance = new MapRenderer(host!, map, onHexClick);
      renderer = instance;
      await instance.initialize();
      if (abort.signal.aborted) return;
      instance.submitSnapshot(buildRenderSnapshot(gameWorld));
    }

    void start().catch(error => {
      if (!abort.signal.aborted) {
        console.error('地图加载失败：', error);
        setLoadingError(error instanceof Error ? error.message : String(error));
      }
    });

    return () => {
      abort.abort();
      renderer?.destroy();
    };
  }, []);

  return <div ref={hostRef} className="map-canvas" aria-label="六边形政治地图">
    {loadingError && (
      <div className="map-error" role="alert">
        <strong>地图加载失败</strong>
        <p>{loadingError}</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
      </div>
    )}
  </div>;
}
