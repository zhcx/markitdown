// Monaco 内核的静态聚合入口。此模块只应被 monacoLoader 通过单一
// 动态 import 引用——这样打包器能把全部 monaco 模块收进同一个懒加载
// chunk，而不会与启动关键路径产生任何静态边。
import 'monaco-editor/esm/nls.messages.zh-cn.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

(self as typeof self & { MonacoEnvironment?: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

export default monaco;
