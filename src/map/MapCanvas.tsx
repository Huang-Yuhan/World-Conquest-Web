import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { COUNTRIES, PROVINCES, countryById } from '../core/world.ts';
import { MAP_WIDTH, MAP_HEIGHT, center, polygon } from './geometry.ts';

const FONT = 'Noto Sans CJK SC, Noto Sans SC, Microsoft YaHei, PingFang SC, sans-serif';

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const maybeHost = containerRef.current;
    if (!maybeHost) return;
    const host: HTMLDivElement = maybeHost;

    const app = new Application();
    const map = new Container();
    let disposed = false;
    let initialized = false;

    // 地图视图仅由 PixiJS 管理，不需要 React UI 状态。
    let zoomToFit = 1;
    let scale = 1;
    let x = 0;
    let y = 0;
    let drag: { pointerId: number; startX: number; startY: number; x: number; y: number } | null = null;

    function applyCamera() {
      map.position.set(x, y);
      map.scale.set(scale);
    }

    function fitToScreen() {
      if (!host) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      zoomToFit = Math.min(width / (MAP_WIDTH + 80), height / (MAP_HEIGHT + 80));
      scale = zoomToFit;
      x = (width - MAP_WIDTH * scale) / 2;
      y = (height - MAP_HEIGHT * scale) / 2;
      applyCamera();
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x, y };
      host?.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      x = drag.x + event.clientX - drag.startX;
      y = drag.y + event.clientY - drag.startY;
      applyCamera();
    }

    function onPointerUp(event: PointerEvent) {
      if (drag?.pointerId !== event.pointerId) return;
      drag = null;
      if (host?.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    }

    function onWheel(event: WheelEvent) {
      if (!host) return;
      event.preventDefault();
      const bounds = host.getBoundingClientRect();
      const mouseX = event.clientX - bounds.left;
      const mouseY = event.clientY - bounds.top;
      const newScale = Math.max(zoomToFit * 0.5, Math.min(zoomToFit * 7, scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const ratio = newScale / scale;
      x = mouseX - (mouseX - x) * ratio;
      y = mouseY - (mouseY - y) * ratio;
      scale = newScale;
      applyCamera();
    }

    async function initialize() {
      await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, preference: 'webgl' });
      initialized = true;
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }

      host.appendChild(app.canvas);
      app.stage.addChild(map);

      for (const province of PROVINCES) {
        const shape = new Graphics()
          .poly(polygon(province))
          .fill({ color: countryById(province.ownerId).color })
          .stroke({ color: 0x2d4048, width: 1.8 });
        map.addChild(shape);
      }

      for (const province of PROVINCES) {
        const point = center(province);
        const label = new Text({
          text: province.name,
          style: { fontFamily: FONT, fontSize: 11, fill: 0x253943 },
        });
        label.anchor.set(0.5);
        label.position.set(point.x, point.y + 7);
        map.addChild(label);
      }

      for (const country of COUNTRIES) {
        const provinces = PROVINCES.filter((province) => province.ownerId === country.id);
        if (provinces.length === 0) continue;
        const px = provinces.reduce((total, province) => total + center(province).x, 0) / provinces.length;
        const py = provinces.reduce((total, province) => total + center(province).y, 0) / provinces.length;
        const label = new Text({
          text: country.name,
          style: { fontFamily: FONT, fontSize: 20, fontWeight: 'bold', fill: 0x152b35 },
        });
        label.anchor.set(0.5);
        label.alpha = 0.65;
        label.position.set(px, py - 37);
        map.addChild(label);
      }

      fitToScreen();
      host.addEventListener('pointerdown', onPointerDown);
      host.addEventListener('pointermove', onPointerMove);
      host.addEventListener('pointerup', onPointerUp);
      host.addEventListener('pointercancel', onPointerUp);
      host.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('resize', fitToScreen);
    }

    void initialize();

    return () => {
      disposed = true;
      if (!initialized) return;
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('pointercancel', onPointerUp);
      host.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', fitToScreen);
      app.destroy(true, { children: true });
    };
  }, []);

  return <div ref={containerRef} className="map-canvas" aria-label="阿斯特里亚政治地图" />;
}
