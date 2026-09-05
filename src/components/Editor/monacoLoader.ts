// Monaco 体积约 3.5 MB，是启动包里最大的单一依赖。这里把它改成按需加载：
// 应用外壳（标题栏、侧栏、预览）先完成首帧渲染，编辑器内核随后并行加载。
// 注意：所有 monaco 相关 import 都必须收敛在 monacoApiSetup 内并经由本模块
// 的单一动态边界引用，否则静态依赖会把整个 monaco chunk 拖回启动关键路径。
import type * as MonacoApi from 'monaco-editor/esm/vs/editor/editor.api.js';

export type MonacoModule = typeof MonacoApi;

let loader: Promise<MonacoModule> | null = null;
let cached: MonacoModule | null = null;

// 供加载完成后（编辑器实例已存在）的代码同步取用。
export function getMonacoApi(): MonacoModule {
  if (!cached) throw new Error('Monaco 尚未加载完成');
  return cached;
}

export function loadMonaco(): Promise<MonacoModule> {
  if (!loader) {
    loader = import('./monacoApiSetup').then((module) => {
      cached = module.default;
      return module.default;
    });
  }
  return loader;
}
