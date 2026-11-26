# KEM 客户端插件模板 · 本地播放器

这是一个 KEM API v1 客户端插件。它用 Svelte 5 写界面，在 KEM 的 Renderer 里与宿主共享同一个 Cordis 树、同一份 Svelte 运行时和同一个 document，因此导航页与底栏可以直接共享模块状态——不需要 iframe，也没有跨帧消息。

| 贡献 | 位置 | 说明 |
| --- | --- | --- |
| 导航页 | `src/PlayerMain.svelte` | 曲库列表、播放控制、进度与音量 |
| 底栏 | `src/PlayerFooter.svelte` | 常驻主界面底部，切页不中断播放 |
| 托盘与浮窗 | `src/client.ts` | 托盘菜单控制播放，浮窗显示歌词 |
| 状态 | `src/player-store.ts` | 单一 store，被导航页与底栏共同订阅 |

## 本地开发

使用 Node.js 24 和 `package.json` 指定的 pnpm 版本，在项目根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 以 watch 模式重建 `dist/client.js` 和 `dist/chunks/`。用 `pnpm pack`（或 `npm pack`）打出 `.tgz`，然后在支持原生 ESM 插件的 KEM 中用「插件 → 导入本地插件」导入。

| 要修改的内容 | 文件 |
| --- | --- |
| 导航页 | `src/PlayerMain.svelte` |
| 底栏 | `src/PlayerFooter.svelte` |
| 播放状态、曲库、歌词解析 | `src/player-store.ts` |
| 插件标识、市场标题、标签及入口 | `package.json` 的 `kem` 字段 |
| 贡献注册与桌面能力 | `src/client.ts` |
| KEM Host 端逻辑 | `host.mjs`，纯界面插件可保留空的默认导出 |

## 构建契约

`pnpm run build` 直接用 Vite 生成原生 ESM。`package.json` 声明：

```json
{
  "client": {
    "root": "./dist",
    "entry": "./client.js",
    "label": "本地播放器"
  },
  "host": "./host.mjs"
}
```

- `kem.client.root` 相对于 npm 包根目录；`kem.client.entry` 相对于该发布根目录，不包含 `dist/` 前缀。`host.mjs` 相对于包根目录，留在客户端发布根目录之外。
- `dist/client.js` 默认导出 Cordis 插件，并通过相对路径静态导入 `./chunks/player-state-<hash>.js`。导航页、底栏与桌面控制共享该 chunk 中的同一个播放器 store。导入或分发时保留整个 `dist/` 目录结构。
- KEM 提供共享的 Svelte 客户端运行时。本产物实际使用的裸导入是 `svelte`、`svelte/internal/client`、`svelte/internal/disclose-version` 和 `svelte/store`。`svelte/reactivity` 也是宿主支持的入口，但目前没有用到。没有额外的裸导入或插件依赖，因此省略 `requires`。
- 组件样式仍由 Svelte 注入（`css: 'injected'`）。`dist/` 只包含客户端 JS 模块；构建会检查入口、分块和外部依赖，并将全部客户端模块限制在 4 MiB 以内。

## 与 KEM 运行时配合

- 导航页与底栏都接收 KEM 传入的 `snapshot`（含 `bootId`、`revision`）。`bootId` 变化表示 Host 已重启，插件会暂停播放、回收旧 `blob:` URL 并清空曲库，保留音量。
- KEM 通过 revision/SSE 把其他窗口的启停同步到当前窗口。停用、升级或卸载会释放 Fiber，音频、ObjectURL、托盘菜单和浮窗随 `ctx.effect` 一起回收。
- 「重载 Host」会重新加载窗口，插件按新 bundle 重新激活，内存态回到初始值。
- 每个窗口拥有自己的 Cordis Context 和 bundle 实例，播放状态不跨窗口共享；需要跨窗口时应在 Host 侧持久化。

## 验收

```sh
pnpm run check   # TypeScript + Svelte
pnpm test        # 构建 + 校验 bundle 契约
pnpm run build   # 只构建
```

`pnpm test` 会先构建，再检查入口与分块的 ESM 导入图、相对路径和共享裸导入。测试使用 Node 的 `--conditions=browser` 选中真实 Svelte 客户端运行时，原生导入入口并验证 Cordis 默认导出、导航/底栏注册与桌面资源清理；同时验证 Host `bootId` 变化时旧曲目与 ObjectURL 会被回收。

在 KEM 里的人工验收：

1. 启用插件，打开导航「本地播放器」，选择音频文件夹与同名 `.lrc`。
2. 底栏出现控制条，导航页与底栏显示同一曲目，进度同步。
3. 切到其他导航页再切回，底栏保持挂载、播放不中断。
4. 托盘菜单可播放/暂停、上一首、下一首，浮窗显示歌词。
5. 停用插件，导航项、底栏、托盘菜单和浮窗同时消失；重新启用后恢复，曲库清空。
6. 在另一个窗口停用同一个插件，当前窗口无需操作即可释放底栏与播放；在「运行时」点击「重载 Host」后按新 bundle 重新激活。

## 创建和发布插件

1. 在 `package.json` 中设置 npm 包名、版本、作者和描述。将 `kem.id` 换成自己的唯一标识，以小写字母开头，可含小写字母、数字和连字符，最长 64 个字符。更新 `kem.title`、`kem.description` 和 `kem.client.label`。
2. 运行 `pnpm pack` 或 `npm pack`。`prepack` 会重新构建；`.tgz` 包含整个 `dist/`（入口及分块）、独立的 `host.mjs`、`package.json` 和 README。不包含源码、测试或旧版播放器。可用 `tar -tf kem-local-player-<version>.tgz` 检查包内路径。
3. 准备发布时，移除 `private: true`，将包发布到目标 npm registry，再将对应包名和版本加入 KEM 市场索引。

`kem.client.entry` 使用相对于 `kem.client.root` 的 `./` 路径。KEM 从该客户端发布根目录加载 ESM 模块图，而不是读取单文件并求值。
