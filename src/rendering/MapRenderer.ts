import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { RenderSnapshot } from '../contracts/RenderSnapshot.ts';
import type { MapData } from '../map/MapData.ts';
import type { CityDefinition } from '../map/MapDefinition.ts';
import { DIRECTIONS, hexCenter, hexCorners, hexId, type Point } from '../map/hex.ts';
import cityIconUrl from '../assets/city.svg?url';
import capitalIconUrl from '../assets/capital.svg?url';
import cityMarkerUrl from '../assets/city-marker.svg?url';

const FONT = 'Noto Sans CJK SC, Noto Sans SC, Microsoft YaHei, PingFang SC, sans-serif';
const EDGE_NEIGHBORS = [
  DIRECTIONS[1], DIRECTIONS[0], DIRECTIONS[5],
  DIRECTIONS[4], DIRECTIONS[3], DIRECTIONS[2],
] as const;

interface CityMarker {
  readonly node: Container;
  readonly detail: Sprite;
  readonly distant: Sprite;
  readonly label: Text;
}

function lighten(color: number, delta: number): number {
  const channel = (shift: number) => Math.max(0, Math.min(255, ((color >> shift) & 255) + delta));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function provinceTint(provinceId: string, countryColor: number): number {
  let hash = 0;
  for (const char of provinceId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return lighten(countryColor, ((Math.abs(hash) % 7) - 3) * 5);
}

function edge(graphics: Graphics, from: Point, to: Point, color: number, width: number): void {
  graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, width });
}

function createMarker(city: CityDefinition, map: MapData, textures: {
  city: Texture; capital: Texture; distant: Texture;
}): CityMarker {
  const hex = map.hexesById.get(city.hexId)!;
  const position = hexCenter(hex, map.definition.grid);
  const node = new Container();
  node.position.set(position.x, position.y);

  const detail = new Sprite(city.kind === 'capital' ? textures.capital : textures.city);
  detail.width = city.kind === 'capital' ? 43 : 38;
  detail.height = detail.width;
  detail.anchor.set(0.5, 0.86);

  const distant = new Sprite(textures.distant);
  distant.width = city.kind === 'capital' ? 20 : 16;
  distant.height = distant.width;
  distant.anchor.set(0.5);

  const label = new Text({
    text: city.name,
    style: { fontFamily: FONT, fontSize: 12, fontWeight: 'bold',
      fill: 0xffefd2, stroke: { color: 0x1b3340, width: 3 } },
  });
  label.anchor.set(0.5, 0);
  label.position.set(0, 9);
  node.addChild(detail, distant, label);
  return { node, detail, distant, label };
}

/**
 * PixiJS consumes only immutable MapData and a detached RenderSnapshot.
 * It never reads or mutates GameWorld and owns all camera/sprite caches.
 */
export class MapRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly terrain = new Container();
  private readonly countryLabels = new Container();
  private readonly cityLayer = new Container();

  private readonly tiles = new Map<string, Graphics>();
  private readonly cityMarkers: CityMarker[] = [];
  private readonly provinceBorders = new Graphics();
  private readonly frontLines = new Graphics();
  private readonly coastlines = new Graphics();

  private initialized = false;
  private destroyed = false;
  private lastRevision = -1;
  private scale = 1;
  private fitScale = 1;
  private cameraX = 0;
  private cameraY = 0;
  private drag: {
    id: number; pointerX: number; pointerY: number; cameraX: number; cameraY: number;
  } | null = null;

  constructor(
    private readonly host: HTMLDivElement,
    private readonly map: MapData,
  ) {}

  async initialize(): Promise<void> {
    await this.app.init({
      resizeTo: this.host,
      antialias: true,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 3),
      preference: 'webgl',
    });

    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.initialized = true;
    this.host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.terrain, this.countryLabels, this.cityLayer);

    this.createTiles();
    this.createStaticBorders();

    // Rasterize the original SVG sources at high resolution once; the icon
    // size is held constant in screen pixels as the map camera zooms.
    const [city, capital, distant] = await Promise.all([
      Assets.load<Texture>({ src: cityIconUrl, data: { resolution: 4 } }),
      Assets.load<Texture>({ src: capitalIconUrl, data: { resolution: 4 } }),
      Assets.load<Texture>({ src: cityMarkerUrl, data: { resolution: 4 } }),
    ]);
    if (this.destroyed) return;

    for (const cityDefinition of this.map.cities) {
      const marker = createMarker(cityDefinition, this.map, { city, capital, distant });
      this.cityMarkers.push(marker);
      this.cityLayer.addChild(marker.node);
    }

    this.host.addEventListener('pointerdown', this.pointerDown);
    this.host.addEventListener('pointermove', this.pointerMove);
    this.host.addEventListener('pointerup', this.pointerUp);
    this.host.addEventListener('pointercancel', this.pointerUp);
    this.host.addEventListener('wheel', this.wheel, { passive: false });
    window.addEventListener('resize', this.fitToScreen);
    this.fitToScreen();
  }

  private createTiles(): void {
    for (const hex of this.map.hexes) {
      const shape = new Graphics();
      this.tiles.set(hex.id, shape);
      this.terrain.addChild(shape);
    }
    this.terrain.addChild(this.provinceBorders, this.frontLines, this.coastlines);
  }

  private createStaticBorders(): void {
    for (const hex of this.map.hexes) {
      if (hex.terrain === 'ocean') continue;
      const corners = hexCorners(hex, this.map.definition.grid);
      for (let i = 0; i < 6; i++) {
        const direction = EDGE_NEIGHBORS[i];
        const neighbor = this.map.hexesById.get(
          hexId({ q: hex.q + direction.q, r: hex.r + direction.r }),
        );
        if (!neighbor || neighbor.terrain === 'ocean') {
          edge(this.coastlines, corners[i], corners[(i + 1) % 6], 0x243b42, 3);
        } else if (hex.id < neighbor.id && hex.provinceId !== neighbor.provinceId) {
          edge(this.provinceBorders, corners[i], corners[(i + 1) % 6], 0x49515a, 2.1);
        }
      }
    }
  }

  submitSnapshot(snapshot: RenderSnapshot): void {
    if (snapshot.mapId !== this.map.definition.id) {
      throw new Error(`RenderSnapshot 地图不匹配: ${snapshot.mapId}`);
    }
    if (!this.initialized || this.destroyed) {
      throw new Error('MapRenderer 尚未初始化或已经销毁');
    }
    if (snapshot.revision === this.lastRevision) return;

    const countryById = new Map(snapshot.countries.map(country => [country.id, country]));
    const controllerByHex = new Map(snapshot.hexes.map(hex => [hex.hexId, hex.controllerId]));
    const cityStates = new Map(snapshot.cities.map(city => [city.cityId, city.controllerId]));

    if (controllerByHex.size !== this.map.hexes.length ||
      this.map.hexes.some(hex => !controllerByHex.has(hex.id))) {
      throw new Error('RenderSnapshot Hex 集合与地图不匹配');
    }
    if (cityStates.size !== this.map.cities.length ||
      this.map.cities.some(city => !cityStates.has(city.id))) {
      throw new Error('RenderSnapshot City 集合与地图不匹配');
    }

    for (const hex of this.map.hexes) {
      const controller = controllerByHex.get(hex.id);
      const color = hex.terrain === 'ocean'
        ? 0x315360
        : controller && countryById.has(controller)
          ? provinceTint(hex.provinceId!, countryById.get(controller)!.color)
          : 0x889493;
      const shape = this.tiles.get(hex.id)!;
      shape.clear()
        .poly(hexCorners(hex, this.map.definition.grid))
        .fill({ color })
        .stroke({
          color: hex.terrain === 'ocean' ? 0x64818b : 0x314650,
          width: hex.terrain === 'ocean' ? 0.45 : 0.65,
          alpha: hex.terrain === 'ocean' ? 0.16 : 0.38,
        });
    }

    // A military front is determined by dynamic Hex control, not static
    // Province borders; it can cut right through the middle of a province.
    this.frontLines.clear();
    for (const hex of this.map.hexes) {
      if (hex.terrain === 'ocean') continue;
      const points = hexCorners(hex, this.map.definition.grid);
      for (let i = 0; i < 6; i++) {
        const direction = EDGE_NEIGHBORS[i];
        const otherId = hexId({ q: hex.q + direction.q, r: hex.r + direction.r });
        const other = this.map.hexesById.get(otherId);
        if (!other || other.terrain === 'ocean' || hex.id >= other.id) continue;
        if (controllerByHex.get(hex.id) !== controllerByHex.get(otherId)) {
          edge(this.frontLines, points[i], points[(i + 1) % 6], 0x27323c, 4.4);
        }
      }
    }

    for (const city of this.map.cities) {
      // City control is derived from its hosting Hex in Gameplay.
      if (!cityStates.has(city.id)) throw new Error(`城市状态缺失：${city.id}`);
    }
    this.rebuildCountryLabels(snapshot, countryById, controllerByHex);
    this.lastRevision = snapshot.revision;
  }

  private rebuildCountryLabels(
    snapshot: RenderSnapshot,
    countries: Map<string, RenderSnapshot['countries'][number]>,
    controllers: Map<string, string | null>,
  ): void {
    const removed = this.countryLabels.removeChildren();
    for (const child of removed) child.destroy();

    // Use the centers of controlled cities, keeping the labels as before.
    for (const country of snapshot.countries) {
      const occupiedCities = this.map.cities.filter(city => controllers.get(city.hexId) === country.id);
      if (occupiedCities.length === 0 || !countries.has(country.id)) continue;
      let x = 0;
      let y = 0;
      for (const city of occupiedCities) {
        const position = hexCenter(this.map.hexesById.get(city.hexId)!, this.map.definition.grid);
        x += position.x;
        y += position.y;
      }
      const label = new Text({
        text: country.name,
        style: {
          fontFamily: FONT, fontSize: 32, fill: 0x192c36,
          fontWeight: 'bold', letterSpacing: 2,
        },
      });
      label.anchor.set(0.5);
      label.alpha = 0.36;
      label.position.set(x / occupiedCities.length, y / occupiedCities.length - 44);
      this.countryLabels.addChild(label);
    }
  }

  private updateCamera(): void {
    this.world.position.set(this.cameraX, this.cameraY);
    this.world.scale.set(this.scale);
    const detailed = this.scale >= this.fitScale * 0.8;
    for (const marker of this.cityMarkers) {
      marker.node.scale.set(1 / this.scale);
      marker.detail.visible = detailed;
      marker.distant.visible = !detailed;
      marker.label.visible = detailed;
    }
  }

  private readonly fitToScreen = (): void => {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width <= 0 || height <= 0) return;
    const grid = this.map.definition.grid;
    this.fitScale = Math.min((width - 24) / grid.worldWidth, (height - 24) / grid.worldHeight);
    this.scale = this.fitScale;
    this.cameraX = (width - grid.worldWidth * this.scale) / 2;
    this.cameraY = (height - grid.worldHeight * this.scale) / 2;
    this.updateCamera();
  };

  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.drag = {
      id: event.pointerId, pointerX: event.clientX, pointerY: event.clientY,
      cameraX: this.cameraX, cameraY: this.cameraY,
    };
    this.host.setPointerCapture(event.pointerId);
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    this.cameraX = this.drag.cameraX + event.clientX - this.drag.pointerX;
    this.cameraY = this.drag.cameraY + event.clientY - this.drag.pointerY;
    this.updateCamera();
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    this.drag = null;
    if (this.host.hasPointerCapture(event.pointerId)) {
      this.host.releasePointerCapture(event.pointerId);
    }
  };

  private readonly wheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const next = Math.max(this.fitScale * 0.45,
      Math.min(this.fitScale * 8, this.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    const ratio = next / this.scale;
    this.cameraX = x - (x - this.cameraX) * ratio;
    this.cameraY = y - (y - this.cameraY) * ratio;
    this.scale = next;
    this.updateCamera();
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.host.removeEventListener('pointerdown', this.pointerDown);
    this.host.removeEventListener('pointermove', this.pointerMove);
    this.host.removeEventListener('pointerup', this.pointerUp);
    this.host.removeEventListener('pointercancel', this.pointerUp);
    this.host.removeEventListener('wheel', this.wheel);
    window.removeEventListener('resize', this.fitToScreen);
    if (this.initialized) {
      this.app.destroy(true, { children: true });
      this.initialized = false;
    }
  }
}
