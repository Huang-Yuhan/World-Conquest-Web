# World Conquest Web

一个采用 TypeScript、React 19、PixiJS 8 和 Vite 7 的六边形战略地图原型。当前网页提供全屏地图、基础地面部队移动与确定性战斗原型；尚无回合、招募与经济系统。

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
- **GameWorld**：保存当前控制权、单位位置、剩余 MP 等可变状态，不依赖渲染实现。
- **Movement**：Gameplay 内使用 Dijkstra 计算最小移动消耗和路径，RenderSnapshot 不携带寻路算法。
- **Combat**：Gameplay 内纯函数计算伤害和反击；GameWorld 原子提交战斗结果。
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

鼠标左键拖动平移，滚轮缩放。**点击带有“步、坦、反、炮”符号的单位**可以选中它，浅绿色 Hex 是可达的空位，再点击目标 Hex 移动。点击敌方红色高亮 Hex 发起攻击；点击其他单位切换选中。单位图标下方的绿色/黄色/红色短条显示剩余 HP，右上角金点表示仍可主动攻击，灰点表示本回合攻击已用完。城市原始素材使用 SVG；PixiJS 按高分辨率生成纹理，远景自动切换到简化标记。

## 地面单位移动 MVP

剧本可选声明 `initialUnits`，每个地面 Hex 只允许一支单位。阿斯特里亚剧本预置了 15 个示例单位（五个国家各三支），可以点击选择与移动；该版本**尚无当前玩家限制**，可选中任一国家的单位，便于验证系统。

- 初始 MP（临时平衡值）：步兵 3，坦克 7，反坦克炮 3，火炮 2。
- 地形消耗：平原 1，森林或丘陵 2，山地 3；海洋不能通行。
- 友军驻扎的格子可以穿越，但不能停留；敌军占据的格子无法进入。
- 敌方步兵、坦克在相邻 Hex 施加 **+2 MP** 的移动惩罚；反坦克炮在两格内只压制坦克；火炮无移动 ZOC；多单位 ZOC 不叠加。ZOC 不强制停止移动。
- 合法移动经过的无人驻守敌方 Hex 立即改变军事控制权；省份行政边界和原主权不随之变化。移动按路径一次性提交，不允许部分消耗的失败指令。
- 单位移动力不会自行重置；当前未实现回合，重新加载页面即可还原剧本初始状态。

## 地面单位战斗 MVP

点击单位后，射程内可以攻击的敌军 Hex 用**红色**高亮。点击高亮敌军即可攻击；本版本每单位只能**主动攻击一次**，反击无次数限制。移动和攻击互不消耗对方的行动资源，可先移动后攻击、或者先攻击后移动。

- **伤害完全确定性**：`max(1, floor(floor(BaseAttack × (0.5 + 0.5 × HP / MaxHP)) × 克制倍率 × 100 / (100 + Defense + Cover)))`。
- **攻击先结算**：防守方直接被击杀则不能反击；存活且射程能覆盖攻击者才可以反击，反击使用受击后的 HP 计算攻击力。
- **攻防参数（临时测试值）**：步兵攻击 30/防御 20/射程 1；坦克 40/30/射程 1；反坦克炮 36/15/射程 1～2；火炮 42/10/射程 1～3。最小射程和兵种数值尚未最终平衡，暂不增加复杂的视线遮挡。
- **兵种克制倍率（测试值）**：坦克→步兵 1.2；步兵→坦克 0.7；反坦克炮→坦克 1.5；火炮→步兵 1.3；其他 1.0。
- **地形掩护**：森林、丘陵 +10，山地 +20，城市 +15；城市与地形取最高，不叠加。
- **击杀不自动推进或占领**：被消灭单位从 GameWorld 移除，其 ZOC 即刻消失；原 Hex 控制权不随攻击改变。
- **没有回合循环**：一次攻击机会和已消耗 MP 暂时不会恢复；刷新页面重开演示剧本。

## 未实现

完整回合系统及 MP/AP 重置、当前玩家权限、城市占领后的行政接管、海军/空军、补给与经济仍未实现。攻击与移动参数是测试值。
