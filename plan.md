# 环面五子棋（单棋盘版）实现文档

## 1. 项目概述
本项目实现一个基于环面（torus）拓扑的五子棋游戏，棋盘无边界，上下左右周期性连接。采用单个矩形棋盘显示，通过实线和虚线区分边界类型，支持平移操作，所有棋子唯一显示，无重复。游戏逻辑包括落子、胜负判定（考虑周期性）、平移视图、重置等功能。前端使用 TypeScript 和 Canvas 渲染，确保类型安全和高效绘图。

## 2. 技术栈
- **语言**：TypeScript 5.0+
- **渲染**：HTML5 Canvas
- **构建工具**：Vite（默认，`index.html` 在项目根目录）
- **样式**：CSS 用于页面布局和辅助元素
- **开发环境**：Node.js + npm

## 3. 项目结构
```
index.html              # 主页面（Vite 根）
src/
├── style.css           # 样式
├── main.ts             # 入口文件
├── core/
│   ├── types.ts        # 类型定义
│   ├── board.ts        # 棋盘数据结构与周期计算
│   ├── game.ts         # 游戏逻辑（落子、胜负判定）
│   └── constants.ts    # 常量配置
├── rendering/
│   ├── renderer.ts     # Canvas 渲染器
│   └── draw.ts         # 绘图辅助函数
├── interaction/
│   ├── input.ts        # 鼠标/触摸事件处理
│   └── camera.ts       # 视窗平移管理
└── utils/
    └── math.ts         # 数学工具（模运算等）
```

## 4. 核心数据结构
### 4.1 棋盘坐标
```typescript
// types.ts
export type Coord = {
  row: number;      // 行，范围 [0, rows-1]
  col: number;      // 列，范围 [0, cols-1]
};

export type Player = 'black' | 'white' | null;
export type PlayerColor = Exclude<Player, null>;
```

### 4.2 棋盘状态
```typescript
export type BoardState = {
  rows: number;              // 总行数 M
  cols: number;              // 总列数 N
  grid: Player[][];          // 二维数组存储棋子，初始全 null
  currentPlayer: PlayerColor;// 当前轮到谁
  winner: PlayerColor | null;// 胜者
  moveHistory: Coord[];      // 落子历史（可选）
};
```

### 4.3 视窗（相机）状态
```typescript
export type Camera = {
  offsetRow: number;         // 垂直偏移（整数，0 <= offsetRow < rows）
  offsetCol: number;         // 水平偏移（整数，0 <= offsetCol < cols）
};
```
偏移量表示当前显示区域左上角对应的环面坐标。例如，当偏移为 `(0,0)` 时，显示原始坐标区域；偏移为 `(1,0)` 时，整个棋盘向下平移一行，原来第一行移到最底部。

## 5. 棋盘表示与周期计算
### 5.1 模运算函数
由于所有坐标都是模 `rows` 和 `cols` 的，定义以下工具函数：
```typescript
// utils/math.ts
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
```

### 5.2 坐标转换
- **环面坐标转画布坐标**：给定环面坐标 `(r, c)` 和相机偏移 `(offR, offC)`，其在画布上的网格位置为：
  ```typescript
  const gridRow = (r - offR + rows) % rows;
  const gridCol = (c - offC + cols) % cols;
  ```
  然后乘以格子大小得到像素坐标。
- **画布坐标转环面坐标**：给定鼠标点击在画布上的格子索引 `(gridR, gridC)`（即第几行第几列），环面坐标为：
  ```typescript
  const r = (gridR + offR) % rows;
  const c = (gridC + offC) % cols;
  ```

### 5.3 周期性邻居
给定一个坐标 `(r, c)`，其八个方向邻居：
```typescript
const directions = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];
const neighborRow = mod(r + dr, rows);
const neighborCol = mod(c + dc, cols);
```

## 6. 渲染模块
### 6.0 画布尺寸与清晰度
- 使用 `devicePixelRatio` 进行缩放，避免高清屏模糊。
- `cellSize` 按可视区域与边距动态计算，确保棋盘居中并保持正方形。

### 6.1 渲染器类
```typescript
// rendering/renderer.ts
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cellSize: number;      // 格子像素大小
  private boardWidth: number;    // 画板宽度 = cols * cellSize
  private boardHeight: number;   // 画板高度 = rows * cellSize

  constructor(canvas: HTMLCanvasElement, rows: number, cols: number) {
    // 初始化 canvas 和上下文
    // 计算合适的 cellSize 适应画布
  }

  // 绘制整个棋盘
  draw(board: BoardState, camera: Camera) {
    this.clear();
    this.drawGrid(camera);
    this.drawPieces(board, camera);
    this.drawBoundaryArrows();
  }

  private drawGrid(camera: Camera) {
    // 绘制网格线，区分实线和虚线
    // - 上边界（行索引 0）: 实线
    // - 下边界（行索引 rows-1）: 虚线
    // - 左边界（列索引 0）: 实线
    // - 右边界（列索引 cols-1）: 虚线
    // 网格内部线条用细实线
  }

  private drawPieces(board: BoardState, camera: Camera) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const player = board.grid[r][c];
        if (player) {
          // 根据相机偏移计算此棋子在画布上的格子索引
          const gridR = (r - camera.offsetRow + rows) % rows;
          const gridC = (c - camera.offsetCol + cols) % cols;
          // 绘制圆形棋子
          this.drawPieceAt(gridR, gridC, player);
        }
      }
    }
  }

  private drawBoundaryArrows() {
    // 在四条边的中点附近绘制箭头和文字
    // 上边：箭头指向下方，文字 "↓"
    // 下边：箭头指向上方，文字 "↑"
    // 左边：箭头指向右方，文字 "→"
    // 右边：箭头指向左方，文字 "←"
    // 角点处可添加小标记（例如圆点）
  }
}
```

### 6.2 线条样式
- **实线**：`ctx.setLineDash([])`
- **虚线**：`ctx.setLineDash([5, 3])`（可根据视觉效果调整）
- 边界线加粗或使用不同颜色（如灰色）以突出。

## 7. 交互模块
### 7.0 事件模型
- 使用 Pointer Events 统一鼠标与触摸。
- `canvas.style.touchAction = 'none'`，防止移动端滚动干扰。

### 7.1 输入处理
```typescript
// interaction/input.ts
export class InputHandler {
  private canvas: HTMLCanvasElement;
  private onMove: (dr: number, dc: number) => void;   // 平移回调
  private onPlace: (coord: Coord) => void;            // 落子回调
  private dragStart: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, onMove: (dr: number, dc: number) => void, onPlace: (coord: Coord) => void) {
    this.canvas = canvas;
    this.onMove = onMove;
    this.onPlace = onPlace;
    this.attachEvents();
  }

  private attachEvents() {
    // pointerdown / pointermove / pointerup / pointercancel
  }

  private handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键
    this.dragStart = { x: e.offsetX, y: e.offsetY };
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.dragStart) return;
    e.preventDefault();
    const dx = e.offsetX - this.dragStart.x;
    const dy = e.offsetY - this.dragStart.y;
    // 判断是否超过拖动阈值（例如 5px）
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      // 根据像素移动计算格子移动
    const cellSize = this.getCellSize(); // 需要从外部获取
    const dr = -Math.round(dy / cellSize); // 向上拖动减少偏移？
      const dc = -Math.round(dx / cellSize);
      if (dr !== 0 || dc !== 0) {
        this.onMove(dr, dc);
        this.dragStart = { x: e.offsetX, y: e.offsetY }; // 重置起点避免累积
      }
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this.dragStart) return;
    const dx = e.offsetX - this.dragStart.x;
    const dy = e.offsetY - this.dragStart.y;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      // 点击事件，计算落子位置
    const cellSize = this.getCellSize();
    const gridCol = Math.floor(e.offsetX / cellSize);
    const gridRow = Math.floor(e.offsetY / cellSize);
    if (gridRow >= 0 && gridRow < rows && gridCol >= 0 && gridCol < cols) {
      this.onPlace({ row: gridRow, col: gridCol });
    }
    }
    this.dragStart = null;
  };

  private handleMouseLeave = () => {
    this.dragStart = null;
  };
}
```

### 7.2 相机管理
```typescript
// interaction/camera.ts
export class CameraController {
  private _offsetRow: number;
  private _offsetCol: number;
  private rows: number;
  private cols: number;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this._offsetRow = 0;
    this._offsetCol = 0;
  }

  get offsetRow() { return this._offsetRow; }
  get offsetCol() { return this._offsetCol; }

  move(dr: number, dc: number) {
    this._offsetRow = mod(this._offsetRow + dr, this.rows);
    this._offsetCol = mod(this._offsetCol + dc, this.cols);
  }

  reset() {
    this._offsetRow = 0;
    this._offsetCol = 0;
  }
}
```

## 8. 游戏逻辑
### 8.0 渲染节流
- 使用 `requestAnimationFrame` 合并多次渲染请求，避免频繁重绘。

### 8.1 游戏类
```typescript
// core/game.ts
export class Game {
  private board: BoardState;
  private camera: CameraController;
  private renderer: Renderer;
  private input: InputHandler;

  constructor(canvas: HTMLCanvasElement, rows: number = 15, cols: number = 15) {
    this.board = {
      rows, cols,
      grid: Array(rows).fill(null).map(() => Array(cols).fill(null)),
      currentPlayer: 'black',
      winner: null,
      moveHistory: []
    };
    this.camera = new CameraController(rows, cols);
    this.renderer = new Renderer(canvas, rows, cols);
    this.input = new InputHandler(canvas, this.onMove, this.onPlace);
    this.render();
  }

  private onMove = (dr: number, dc: number) => {
    if (this.board.winner) return; // 游戏结束不可移动视图？可以允许，但最好保留
    this.camera.move(dr, dc);
    this.render();
  };

  private onPlace = (gridCoord: Coord) => {
    if (this.board.winner) return;
    // 将网格坐标转换为环面坐标
    const r = mod(gridCoord.row + this.camera.offsetRow, this.board.rows);
    const c = mod(gridCoord.col + this.camera.offsetCol, this.board.cols);
    if (this.board.grid[r][c] !== null) return; // 已有棋子

    // 落子
    this.board.grid[r][c] = this.board.currentPlayer;
    this.board.moveHistory.push({ row: r, col: c });

    // 检查胜负
    if (this.checkWin(r, c)) {
      this.board.winner = this.board.currentPlayer;
    } else {
      this.board.currentPlayer = this.board.currentPlayer === 'black' ? 'white' : 'black';
    }

    this.render();
  };

  private checkWin(row: number, col: number): boolean {
    const player = this.board.grid[row][col];
    if (!player) return false;
    const directions = [
      [1, 0], [0, 1], [1, 1], [1, -1]
    ];
    for (const [dr, dc] of directions) {
      let count = 1;
      // 正方向
      for (let step = 1; step < 5; step++) {
        const nr = mod(row + dr * step, this.board.rows);
        const nc = mod(col + dc * step, this.board.cols);
        if (this.board.grid[nr][nc] === player) count++; else break;
      }
      // 负方向
      for (let step = 1; step < 5; step++) {
        const nr = mod(row - dr * step, this.board.rows);
        const nc = mod(col - dc * step, this.board.cols);
        if (this.board.grid[nr][nc] === player) count++; else break;
      }
      if (count >= 5) return true;
    }
    return false;
  }

  private render() {
    this.renderer.draw(this.board, this.camera);
  }

  reset() {
    this.board.grid = Array(this.board.rows).fill(null).map(() => Array(this.board.cols).fill(null));
    this.board.currentPlayer = 'black';
    this.board.winner = null;
    this.board.moveHistory = [];
    this.camera.reset();
    this.render();
  }
}
```

## 9. 辅助功能
### 9.1 重置按钮
在 HTML 中添加按钮，调用 `game.reset()`。

### 9.2 显示当前玩家和胜者
在页面顶部添加状态栏，从 `game.board` 读取并更新。

### 9.3 落子历史提示（可选）
可以添加撤销功能，或高亮最后一步。

### 9.4 交互状态栏
在状态栏中显示当前玩家和胜者，胜利后禁止继续落子。

## 10. 边界与角点的视觉处理细节
- **实线边界**：上边和左边用实线绘制，线宽稍粗。
- **虚线边界**：下边和右边用虚线绘制。
- **角点**：
  - 左上角绘制实心圆点，表示这是实线交点。
  - 其他三个角点绘制空心圆点或小虚线圆，并可在旁边添加提示文字（如“连接对角”）。
- **箭头**：
  - 上边箭头：指向下方，文字“↓ 连接下边”
  - 下边箭头：指向上方，文字“↑ 连接上边”
  - 左边箭头：指向右方，文字“→ 连接右边”
  - 右边箭头：指向左方，文字“← 连接左边”

## 11. 性能优化
- 使用 `requestAnimationFrame` 批量渲染。
- 避免在每次绘制时重新创建大对象。
- 对于大棋盘（如 19x19），考虑离屏缓存或仅绘制可见区域（但此处整个棋盘都可见，无需裁剪）。

## 11.1 手动测试清单
- 拖动平移后落子位置正确。
- 棋子跨边界连成五子能判胜。
- 胜利后不再落子但允许平移观察。
- 角点落子与环面连接逻辑正确。

## 12. 扩展可能性
- **AI 对战**：集成简单 AI（如基于极大极小算法）。
- **联网对战**：通过 WebSocket 实现。
- **自定义棋盘大小**：添加输入框调整。
- **动画效果**：落子时简单缩放或涟漪效果。

## 13. 实现步骤总结
1. 搭建项目环境，配置 TypeScript 和构建工具。
2. 定义核心类型和常量。
3. 实现棋盘数据结构和周期工具函数。
4. 实现相机管理和坐标转换。
5. 实现渲染器，支持网格、棋子、边界箭头。
6. 实现输入处理，区分拖动和点击。
7. 实现游戏逻辑（落子、胜负判定）。
8. 整合所有模块，创建主循环。
9. 添加辅助 UI 和重置功能。
10. 测试边界情况（如角点五子连珠、平移后落子等）。
11. 适配高清屏与响应式布局。

## 14. 注意事项
- **模运算处理**：JavaScript 的 `%` 对负数返回负余数，必须使用自定义 `mod` 函数。
- **拖动阈值**：避免微小抖动导致误移动。
- **游戏结束后的交互**：通常不允许再落子，但可以允许平移查看棋盘。
- **移动端适配**：支持触摸事件，处理多点触控。

此文档提供了完整的实现蓝图，可依此进行编码。
