import { useEffect, useRef } from 'react';
import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import {
  CITIES, COUNTRIES, COUNTRIES_BY_ID, HEXES, HEXES_BY_ID,
  PROVINCES, PROVINCES_BY_ID, type City,
} from '../core/world.ts';
import { DIRECTIONS, MAP_HEIGHT, MAP_WIDTH, hexCenter, hexCorners, hexId, type Point } from './hex.ts';
import cityIconUrl from '../assets/city.svg?url';
import capitalIconUrl from '../assets/capital.svg?url';
import cityMarkerUrl from '../assets/city-marker.svg?url';

const FONT = 'Noto Sans CJK SC, Noto Sans SC, Microsoft YaHei, PingFang SC, sans-serif';

// Pointy-top hexagon sides in clockwise order, starting from the top-right edge.
const EDGE_NEIGHBORS = [
  DIRECTIONS[1], DIRECTIONS[0], DIRECTIONS[5],
  DIRECTIONS[4], DIRECTIONS[3], DIRECTIONS[2],
] as const;

interface Marker {
  node: Container;
  detail: Sprite;
  distant: Sprite;
  label: Text;
}

function offsetColor(color: number, amount: number): number {
  const adjust = (shift: number) => Math.max(0, Math.min(255, ((color >> shift) & 255) + amount));
  return (adjust(16) << 16) | (adjust(8) << 8) | adjust(0);
}

function provinceColor(provinceId: string): number {
  const province = PROVINCES_BY_ID.get(provinceId)!;
  const base = COUNTRIES_BY_ID.get(province.ownerId)!.color;
  let hash = 0;
  for (const character of provinceId) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return offsetColor(base, ((Math.abs(hash) % 7) - 3) * 5);
}

function drawBorder(graphics: Graphics, from: Point, to: Point, color: number, width: number) {
  graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, width });
}

function drawTerrain(layer: Container) {
  // Each visible hex is individually filled. A province is many hexes, not one polygon.
  for (const hex of HEXES) {
    const tile = new Graphics()
      .poly(hexCorners(hex))
      .fill({ color: provinceColor(hex.provinceId) })
      .stroke({ color: 0x314650, width: 0.65, alpha: 0.38 });
    layer.addChild(tile);
  }

  const provinceBorders = new Graphics();
  const countryBorders = new Graphics();
  const coastline = new Graphics();

  for (const hex of HEXES) {
    const points = hexCorners(hex);
    const province = PROVINCES_BY_ID.get(hex.provinceId)!;

    for (let i = 0; i < 6; i++) {
      const direction = EDGE_NEIGHBORS[i];
      const neighborId = hexId({ q: hex.q + direction.q, r: hex.r + direction.r });
      const other = HEXES_BY_ID.get(neighborId);

      if (!other) {
        drawBorder(coastline, points[i], points[(i + 1) % 6], 0x243b42, 3);
        continue;
      }

      // Each shared border is drawn exactly once, avoiding doubled line thickness.
      if (hex.id > other.id || other.provinceId === hex.provinceId) continue;
      const neighboringProvince = PROVINCES_BY_ID.get(other.provinceId)!;

      if (province.ownerId !== neighboringProvince.ownerId) {
        drawBorder(countryBorders, points[i], points[(i + 1) % 6], 0x27323c, 4.4);
      } else {
        drawBorder(provinceBorders, points[i], points[(i + 1) % 6], 0x49515a, 2.1);
      }
    }
  }

  layer.addChild(provinceBorders, countryBorders, coastline);
}

function addCountryNames(layer: Container) {
  for (const country of COUNTRIES) {
    const own = PROVINCES.filter((province) => province.ownerId === country.id);
    const cityHexes = own.map((province) =>
      HEXES_BY_ID.get(CITIES.find((city) => city.provinceId === province.id)!.hexId)!,
    );
    const centerX = cityHexes.reduce((sum, hex) => sum + hexCenter(hex).x, 0) / cityHexes.length;
    const centerY = cityHexes.reduce((sum, hex) => sum + hexCenter(hex).y, 0) / cityHexes.length;

    const label = new Text({
      text: country.name,
      style: { fontFamily: FONT, fontSize: 32, fill: 0x192c36, fontWeight: 'bold', letterSpacing: 2 },
    });
    label.anchor.set(0.5);
    label.position.set(centerX, centerY - 44);
    label.alpha = 0.36;
    layer.addChild(label);
  }
}

function createCityMarker(city: City, textures: { city: Texture; capital: Texture; distant: Texture }): Marker {
  const tile = HEXES_BY_ID.get(city.hexId)!;
  const position = hexCenter(tile);
  const node = new Container();
  node.position.set(position.x, position.y);

  const detail = new Sprite(city.kind === 'capital' ? textures.capital : textures.city);
  const size = city.kind === 'capital' ? 43 : 38;
  detail.width = size;
  detail.height = size;
  detail.anchor.set(0.5, 0.86);

  const distant = new Sprite(textures.distant);
  distant.width = city.kind === 'capital' ? 20 : 16;
  distant.height = distant.width;
  distant.anchor.set(0.5);

  const label = new Text({
    text: city.name,
    style: {
      fontFamily: FONT, fontSize: 12, fontWeight: 'bold',
      fill: 0xffefd2, stroke: { color: 0x1b3340, width: 3 },
    },
  });
  label.anchor.set(0.5, 0);
  label.position.set(0, 9);
  node.addChild(detail, distant, label);
  return { node, detail, distant, label };
}

/** Render-only map. No HUD, turn controls or gameplay systems. */
export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const maybeHost = hostRef.current;
    if (!maybeHost) return;
    const host: HTMLDivElement = maybeHost;

    const app = new Application();
    const world = new Container();
    const markers: Marker[] = [];
    let disposed = false;
    let ready = false;

    let fitScale = 1;
    let scale = 1;
    let cameraX = 0;
    let cameraY = 0;
    let drag: { id: number; pointerX: number; pointerY: number; cameraX: number; cameraY: number } | null = null;

    function updateView() {
      world.position.set(cameraX, cameraY);
      world.scale.set(scale);
      const detailed = scale >= fitScale * 0.8;

      // Each city remains a readable constant *screen-pixel* size while the map zooms.
      // The high-resolution SVG-derived textures are never excessively enlarged.
      for (const marker of markers) {
        marker.node.scale.set(1 / scale);
        marker.detail.visible = detailed;
        marker.distant.visible = !detailed;
        marker.label.visible = detailed;
      }
    }

    function fit() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width < 1 || height < 1) return;
      fitScale = Math.min((width - 24) / MAP_WIDTH, (height - 24) / MAP_HEIGHT);
      scale = fitScale;
      cameraX = (width - MAP_WIDTH * scale) / 2;
      cameraY = (height - MAP_HEIGHT * scale) / 2;
      updateView();
    }

    function down(event: PointerEvent) {
      if (event.button !== 0) return;
      drag = {
        id: event.pointerId, pointerX: event.clientX, pointerY: event.clientY,
        cameraX, cameraY,
      };
      host.setPointerCapture(event.pointerId);
    }

    function move(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return;
      cameraX = drag.cameraX + event.clientX - drag.pointerX;
      cameraY = drag.cameraY + event.clientY - drag.pointerY;
      updateView();
    }

    function up(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    }

    function wheel(event: WheelEvent) {
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const next = Math.max(fitScale * 0.45, Math.min(fitScale * 8, scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const factor = next / scale;
      cameraX = mouseX - (mouseX - cameraX) * factor;
      cameraY = mouseY - (mouseY - cameraY) * factor;
      scale = next;
      updateView();
    }

    async function initialize() {
      try {
        await app.init({
          resizeTo: host,
          antialias: true,
          backgroundAlpha: 0,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 3),
          preference: 'webgl',
        });
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }

        ready = true;
        host.appendChild(app.canvas);
        app.stage.addChild(world);

        const terrain = new Container();
        const countryNames = new Container();
        const cityLayer = new Container();
        world.addChild(terrain, countryNames, cityLayer);

        drawTerrain(terrain);
        addCountryNames(countryNames);

        // SVG is rasterized by the PixiJS Assets loader at 4x native resolution.
        // A second visual LOD uses the simplified SVG at distant camera scales.
        const [cityTexture, capitalTexture, distantTexture] = await Promise.all([
          Assets.load<Texture>({ src: cityIconUrl, data: { resolution: 4 } }),
          Assets.load<Texture>({ src: capitalIconUrl, data: { resolution: 4 } }),
          Assets.load<Texture>({ src: cityMarkerUrl, data: { resolution: 4 } }),
        ]);
        if (disposed) return;

        for (const city of CITIES) {
          const marker = createCityMarker(city, {
            city: cityTexture, capital: capitalTexture, distant: distantTexture,
          });
          markers.push(marker);
          cityLayer.addChild(marker.node);
        }

        fit();
        host.addEventListener('pointerdown', down);
        host.addEventListener('pointermove', move);
        host.addEventListener('pointerup', up);
        host.addEventListener('pointercancel', up);
        host.addEventListener('wheel', wheel, { passive: false });
        window.addEventListener('resize', fit);
      } catch (error) {
        if (!disposed) console.error('地图初始化失败：', error);
      }
    }

    void initialize();

    return () => {
      disposed = true;
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up);
      host.removeEventListener('wheel', wheel);
      window.removeEventListener('resize', fit);
      if (ready) app.destroy(true, { children: true });
    };
  }, []);

  return <div ref={hostRef} className="map-canvas" aria-label="阿斯特里亚六边形政治地图" />;
}
