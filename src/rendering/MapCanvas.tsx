import { useEffect, useRef, useState } from 'react';
import { loadMap } from '../map/MapLoader.ts';
import { GameWorld } from '../gameplay/GameWorld.ts';
import { loadScenario } from '../gameplay/ScenarioLoader.ts';
import { buildRenderSnapshot } from '../gameplay/RenderSnapshotBuilder.ts';
import { MapRenderer } from './MapRenderer.ts';
import type { RenderSnapshot } from '../contracts/RenderSnapshot.ts';

type TurnHud = {
  readonly round: number;
  readonly countryIndex: number;
  readonly countryCount: number;
  readonly countryName: string;
  readonly color: number;
};

function createTurnHud(snapshot: RenderSnapshot): TurnHud {
  const active = snapshot.countries.find(country => country.id === snapshot.turn.activeCountryId);
  if (!active) throw new Error('当前国家不存在于 RenderSnapshot');
  return {
    round: snapshot.turn.round,
    countryIndex: snapshot.turn.countryIndex,
    countryCount: snapshot.turn.countryCount,
    countryName: active.name,
    color: active.color,
  };
}

/** React is only the host/composition root, not the map simulation or renderer. */
export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [turnHud, setTurnHud] = useState<TurnHud | null>(null);
  const endTurnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const abort = new AbortController();
    let renderer: MapRenderer | undefined;
    let gameWorld: GameWorld | undefined;
    let selectedUnitId: string | null = null;

    const publish = (): void => {
      if (!renderer || !gameWorld || abort.signal.aborted) return;
      const snapshot = buildRenderSnapshot(gameWorld);
      renderer.submitSnapshot(snapshot);
      setTurnHud(createTurnHud(snapshot));
    };

    endTurnRef.current = () => {
      if (!renderer || !gameWorld || abort.signal.aborted) return;
      gameWorld.endTurn();
      selectedUnitId = null; // Never carry a country's selection into another turn.
      publish();
      renderer.setSelection(null, [], []);
    };

    const onHexClick = (hexId: string): void => {
      if (abort.signal.aborted || !renderer || !gameWorld) return;
      const standingUnit = gameWorld.unitAt(hexId);
      const selected = selectedUnitId ? gameWorld.unitById(selectedUnitId) : undefined;
      if (standingUnit && selected && standingUnit.countryId !== selected.countryId &&
        gameWorld.attackableFor(selected.id).has(hexId)) {
        // A selected unit attacks an in-range enemy instead of selecting it.
        gameWorld.attackUnit(selected.id, hexId);
        if (!gameWorld.unitById(selected.id)) selectedUnitId = null;
        publish()
      } else if (standingUnit) {
        // In hot-seat mode, enemy units remain visible, but only the active
        // country's units may be selected and issued commands.
        selectedUnitId = standingUnit.countryId === gameWorld.activeCountryId
          ? standingUnit.id
          : null;
      } else if (selectedUnitId && gameWorld.reachableFor(selectedUnitId).has(hexId)) {
        gameWorld.moveUnit(selectedUnitId, hexId);
        renderer.submitSnapshot(buildRenderSnapshot(gameWorld));
      } else {
        selectedUnitId = null;
      }
      renderer.setSelection(
        selectedUnitId,
        selectedUnitId ? [...gameWorld.reachableFor(selectedUnitId).keys()] : [],
        selectedUnitId ? [...gameWorld.attackableFor(selectedUnitId).keys()] : [],
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
      publish();
    }

    void start().catch(error => {
      if (!abort.signal.aborted) {
        console.error('地图加载失败：', error);
        setLoadingError(error instanceof Error ? error.message : String(error));
      }
    });

    return () => {
      abort.abort();
      endTurnRef.current = null;
      renderer?.destroy();
    };
  }, []);

  // The HUD must be a sibling, not a descendant, of the PixiJS event host.
  // That keeps native map pointer capture separate from HTML button clicks.
  return <div className="map-shell">
    <div ref={hostRef} className="map-canvas" aria-label="六边形政治地图" />
    {turnHud && (
      <div
        className="turn-hud"
        aria-label="回合控制"
      >
        <div className="turn-hud__status" aria-live="polite">
          <span className="turn-hud__round">
            第 {turnHud.round} 轮 · {turnHud.countryIndex}/{turnHud.countryCount}
          </span>
          <span className="turn-hud__country">
            <span className="turn-hud__swatch" style={{ backgroundColor: `#${turnHud.color.toString(16).padStart(6, '0')}` }} />
            {turnHud.countryName}
          </span>
        </div>
        <button type="button" className="turn-hud__next" onClick={() => endTurnRef.current?.()}>
          结束回合
        </button>
      </div>
    )}
    {loadingError && (
      <div className="map-error" role="alert">
        <strong>地图加载失败</strong>
        <p>{loadingError}</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
      </div>
    )}
  </div>;
}
