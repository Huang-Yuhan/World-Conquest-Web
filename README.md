# World Conquest Web

一个仍在原型阶段的六边形战争策略地图。当前版本 **只有地图**，没有侧栏、控制面板、资源、招募或战斗。

## 当前地图结构

- Hex：使用 pointy-top axial (`q,r`) 六边形坐标；地图由多个独立格子组成。
- Province：通过从城市所在格开始的多源 BFS 生成，保证每省多格且地块连通。
- City：每省恰好一座城市，首都和普通城市使用独立原创 SVG 图标。
- 绘制：PixiJS 8。格线、省界、国界采用不同线宽，滚轮缩放 / 鼠标拖动。
- 清晰度：SVG 素材由 PixiJS Assets 按 4x 分辨率栅格化为纹理；城市大小保持屏幕像素尺寸；远景使用精简标记 LOD。

## 本地使用

Node.js 22.12+。

```sh
npm install
npm run dev
npm test
npm run build
```

现有 GitHub Actions 会对 PR 进行 TypeScript 类型检查、单元测试与构建；合入 `main` 后发布 GitHub Pages。

## 后续范围

这里尚未建模城市资源、部队、建筑、国家外交及其它玩法；当前城市只是位于特定 Hex 上的地图实体。
