import { useEffect, useRef, useState } from 'react';
import { loadMap } from '../map/MapLoader.ts';
import { GameWorld } from '../gameplay/GameWorld.ts';
import { loadScenario } from '../gameplay/ScenarioLoader.ts';
import { buildRenderSnapshot } from '../gameplay/RenderSnapshotBuilder.ts';
import { MapRenderer } from './MapRenderer.ts';
import type { RenderSnapshot } from '../contracts/RenderSnapshot.ts';
import type { ActionMapFeedback } from '../contracts/ActionMapFeedback.ts';
import type { CitySettlementResult, NeighborClaimStatus } from '../gameplay/CityOccupation.ts';
import { UNIT_RULES } from '../gameplay/Units.ts';

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


type ActionReport = {
  readonly kind: 'combat' | 'occupation' | 'settlement' | 'movement';
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
};

const STATUS_LABELS: Readonly<Record<NeighborClaimStatus, string>> = {
  claimed: '已接管',
  alreadyControlled: '原已控制',
  ocean: '海洋',
  outsideProvince: '超出本省',
  otherCity: '其他城市',
  enemyGarrison: '敌方驻军',
  enemyZoc: '敌方行政阻断 ZOC',
  contested: '多国接管冲突',
};

function settlementReport(result: CitySettlementResult, world: GameWorld): ActionReport {
  const cities = result.settledCityIds.map(id => world.map.citiesById.get(id)?.name ?? id);
  const excluded = result.outcomes.filter(item =>
    item.status !== 'claimed' && item.status !== 'alreadyControlled',
  );
  const details = excluded.map(item => {
    const city = world.map.citiesById.get(item.cityId)?.name ?? item.cityId;
    const blockers = item.blockerUnitIds.length ? ' · 单位 ' + item.blockerUnitIds.join('、') : '';
    return city + ' / Hex ' + item.hexId + '：' + STATUS_LABELS[item.status] + blockers;
  });
  const unchangedCount = result.outcomes.filter(item => item.status === 'alreadyControlled').length;
  return {
    kind: 'settlement',
    title: '行政接管 · ' + cities.join('、'),
    summary: '已接管 ' + result.claims.length + ' Hex · 原已控制 ' + unchangedCount + ' · 其他未接管 ' + excluded.length,
    details,
  };
}

/** React is only the host/composition root, not the map simulation or renderer. */
export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [turnHud, setTurnHud] = useState<TurnHud | null>(null);
  const [lastSettlement, setLastSettlement] = useState<string | null>(null);
  const [actionReport, setActionReport] = useState<ActionReport | null>(null);
  const dismissReportRef = useRef<(() => void) | null>(null);
  const endTurnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const abort = new AbortController();
    let renderer: MapRenderer | undefined;
    let gameWorld: GameWorld | undefined;
    let selectedUnitId: string | null = null;

    dismissReportRef.current = () => {
      setActionReport(null);
      renderer?.setActionFeedback(null);
    };

    const publish = (): void => {
      if (!renderer || !gameWorld || abort.signal.aborted) return;
      const snapshot = buildRenderSnapshot(gameWorld);
      renderer.submitSnapshot(snapshot);
      setTurnHud(createTurnHud(snapshot));
    };

    endTurnRef.current = () => {
      if (!renderer || !gameWorld || abort.signal.aborted) return;
      const result = gameWorld.endTurn();
      setLastSettlement(result.settledCityIds.length
        ? `城市结算：${result.settledCityIds.length} 座 / 接管 ${result.claims.length} Hex`
        : null);
      if (result.settledCityIds.length) {
        setActionReport(settlementReport(result, gameWorld));
        const allowed = new Set(['claimed','enemyGarrison','enemyZoc','outsideProvince','otherCity','contested']);
        const hexes = result.outcomes.filter(item => allowed.has(item.status)).map(item => ({
          hexId: item.hexId,
          status: item.status,
        })) as Extract<ActionMapFeedback, { kind: 'city-settlement' }>['hexes'];
        renderer.setActionFeedback({ kind: 'city-settlement', hexes });
      } else {
        setActionReport(null);
        renderer.setActionFeedback(null);
      }
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
        const result = gameWorld.attackUnit(selected.id, hexId);
        const defenderName = gameWorld.scenario.countries.find(c => c.id === standingUnit.countryId)?.name ?? standingUnit.countryId;
        setLastSettlement(null);
        setActionReport({
          kind: 'combat',
          title: result.defenderDestroyed ? '攻击成功 · 敌军被消灭' : '战斗结算',
          summary: '对 ' + defenderName + ' · ' + UNIT_RULES[standingUnit.kind].label +
            ' 造成 ' + result.damageToDefender + ' HP 伤害',
          details: [
            result.counterattacked
              ? '防守方反击造成 ' + result.damageToAttacker + ' HP 伤害（使用受击后的 HP）'
              : result.defenderDestroyed ? '防守方被消灭，无法反击' : '攻击方不在防守方射程内，无法反击',
            '攻击方剩余 ' + result.attackerRemainingHp + ' HP / 防守方剩余 ' + result.defenderRemainingHp + ' HP',
            '攻击不消耗 MP，且不会自动占领敌方 Hex',
          ],
        });
        renderer.setActionFeedback({
          kind: 'combat',
          attackerHexId: selected.hexId,
          defenderHexId: standingUnit.hexId,
          damageToDefender: result.damageToDefender,
          damageToAttacker: result.damageToAttacker,
          defenderDestroyed: result.defenderDestroyed,
          attackerDestroyed: result.attackerDestroyed,
        });
        if (!gameWorld.unitById(selected.id)) selectedUnitId = null;
        publish();
      } else if (standingUnit) {
        // In hot-seat mode, enemy units remain visible, but only the active
        // country's units may be selected and issued commands.
        selectedUnitId = standingUnit.countryId === gameWorld.activeCountryId
          ? standingUnit.id
          : null;
      } else if (selectedUnitId && gameWorld.reachableFor(selectedUnitId).has(hexId)) {
        const route = gameWorld.reachableFor(selectedUnitId).get(hexId)!;
        const movingUnit = gameWorld.unitById(selectedUnitId)!;
        const enteredCities = gameWorld.map.cities.filter(city =>
          route.hexIds.slice(1).includes(city.hexId) &&
          gameWorld!.controllerOf(city.hexId) !== movingUnit.countryId,
        );
        gameWorld.moveUnit(selectedUnitId, hexId);
        setLastSettlement(null);
        renderer.setActionFeedback(null);
        setActionReport(enteredCities.length ? {
          kind: 'occupation',
          title: '夺取城市 · ' + enteredCities.map(city => city.name).join('、'),
          summary: '城市 Hex 已归我方控制，邻格将在本国结束回合时统一结算',
          details: ['本次移动消耗 ' + route.cost + ' MP', '敌军驻守与行政阻断 ZOC 可能阻止周边接管'],
        } : {
          kind: 'movement',
          title: '部队移动完成',
          summary: '消耗 ' + route.cost + ' MP · 剩余 ' + gameWorld.unitById(selectedUnitId)!.mpRemaining + ' MP',
          details: [],
        });
        publish();
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
      dismissReportRef.current = null;
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
          {lastSettlement && <span className="turn-hud__settlement" role="status">{lastSettlement}</span>}
        </div>
        <button type="button" className="turn-hud__next" onClick={() => endTurnRef.current?.()}>
          结束回合
        </button>
      </div>
    )}
    {actionReport && (
      <section className={'action-report action-report--' + actionReport.kind} aria-label="行动结果">
        <div className="action-report__header">
          <strong>{actionReport.title}</strong>
          <button type="button" className="action-report__close"
            aria-label="关闭行动结果" onClick={() => dismissReportRef.current?.()}>×</button>
        </div>
        <p className="action-report__summary" role="status">{actionReport.summary}</p>
        {actionReport.kind === 'settlement' && (
          <div className="action-report__legend" aria-label="地图反馈图例">
            <span>绿色：接管成功</span><span>橙红：敌军阻断</span><span>灰紫：省界／城市／冲突</span>
          </div>
        )}
        {actionReport.details.length > 0 && (
          <details className="action-report__details">
            <summary>查看详细结果（{actionReport.details.length}）</summary>
            <ul>{actionReport.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>
          </details>
        )}
      </section>
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
