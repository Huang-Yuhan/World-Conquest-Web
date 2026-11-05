# World Conquest Web

一个采用 TypeScript、React 19、PixiJS 8 和 Vite 7 的六边形战略地图原型。当前网页仍然只有全屏地图，没有回合、战斗、招募、经济和额外 UI。

## 架构

```text
public/maps/<mapId>/map.json  ─→ MapDefinition / MapData ─────────────┐
public/scenarios/<id>.json    ─→ ScenarioDefinition ─→ GameWorld       │
                                                     │                │
                                                SnapshotBuilder       │
                                                     │                │
                                                RenderSnapshot ─→ MapRenderer (PixiJS)
```

- **MapDefinition**：离线制作的静态地图，包含尖顶六边形网格、陆地及海洋格、固定省份边界、城市点位。不包含国家归属。
- **ScenarioDefinition**：剧本提供国家颜色、名称、省份初始主权和可选的局部 Hex 初始控制权；可共用同一地图资源。
- **GameWorld**：保存当前控制权等可变状态，不依赖渲染实现。
- **RenderSnapshot**：GameWorld 经独立 Builder 生成的不可变数据副本；只包含渲染所需的动态信息，不复制地图几何。
- **MapRenderer**：只接收 `MapData` 和 `RenderSnapshot`，管理 PixiJS 图层、高清城市 SVG、地图镜头及缩放，不读取 GameWorld。

**海洋也拥有 Hex**，只是目前不配置海上主权与海军玩法。省份由多个连通陆地 Hex 组成，一个省份允许多个城市，城市通过 `hexId` 引用所在格。Hex 的控制者存储于 GameWorld，行政省份不会因战争改变。

## 地图文件格式

`public/maps/asteria/map.json` 包含网格配置、地形类型、省份列表、城市列表，以及一个长度为 `cols * rows` 的 `tiles` 数组。

`tiles` 按 **row-major** 顺序排列，每个格子使用 `[provinceIndex, terrainIndex]`；`provinceIndex = -1` 表示海洋。这样的数据量较小，格子坐标可根据行列位置确定，无需在 JSON 中反复写入 `q/r`。

运行时 `createMapData()` 根据文件生成 Hex ID、索引和省份 Hex 集，并校验城市位置、连通性、引用及重复 ID。地图定义不再在运行时使用 BFS 自动生成行政边界，原有地图形状已固定为离线数据。

`public/scenarios/asteria-1936.json` 提供对应地图的初始国家归属。

## 运行

要求 Node.js 22.12+。

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

默认剧本是 `asteria-1936`。在 URL 传入 `?scenario=<id>` 可以加载另一个已创建的剧本；剧本的 `mapId` 决定加载哪一张地图。例如未来添加 `public/maps/europe/map.json` 和 `public/scenarios/europe-1939.json` 后，只需要访问 `?scenario=europe-1939`，无需修改 Renderer 源代码。

鼠标左键拖动平移，滚轮缩放。城市原始素材使用 SVG；PixiJS 按高分辨率生成纹理，远景自动切换到简化标记。

## 未实现

行动、地形移动消耗、ZOC、城市行政接管、战斗规则和部队渲染仍处于设计阶段。GameWorld 的低级状态修改接口只用于为将来的 Gameplay 逻辑提供基础，不代表已经实现占领合法性校验。
