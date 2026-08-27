import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { normalizeLanguage, translateUiText } from './index';

type LocalizedValue = { source: string; last: string };
const textSources = new WeakMap<Text, LocalizedValue>();
const attributeSources = new WeakMap<Element, Map<string, LocalizedValue>>();
const LOCALIZED_ATTRIBUTES = ['aria-label', 'title', 'placeholder'] as const;

function preserveWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] || '';
  const trailing = source.match(/\s*$/)?.[0] || '';
  return `${leading}${translated}${trailing}`;
}

function localizeTree(root: Node, language: ReturnType<typeof normalizeLanguage>) {
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const previous = textSources.get(textNode);
      const source = !previous || textNode.data !== previous.last ? textNode.data : previous.source;
      const trimmed = source.trim();
      const localized = trimmed ? preserveWhitespace(source, translateUiText(trimmed, language)) : source;
      textSources.set(textNode, { source, last: localized });
      if (textNode.data !== localized) textNode.data = localized;
      return;
    }

    if (!(node instanceof Element)) return;
    let sources = attributeSources.get(node);
    if (!sources) {
      sources = new Map();
      attributeSources.set(node, sources);
    }
    for (const attribute of LOCALIZED_ATTRIBUTES) {
      const current = node.getAttribute(attribute);
      if (current === null) continue;
      const previous = sources.get(attribute);
      const source = !previous || current !== previous.last ? current : previous.source;
      const localized = translateUiText(source, language);
      sources.set(attribute, { source, last: localized });
      if (current !== localized) node.setAttribute(attribute, localized);
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  visit(root);
}

export function UiLanguageBridge() {
  const language = normalizeLanguage(useAppStore(state => state.settings.appearance.language));

  useEffect(() => {
    document.documentElement.lang = language;
    const root = document.getElementById('root');
    if (!root) return;

    // React 首次挂载会连续产生大量 DOM 变更。逐条同步处理时，每条变更都要
    // 走一遍断开/重连观察器 + 子树遍历；这里改为微任务批量处理：同一轮变更
    // 汇总到待处理集合，每个子树只遍历一次（localizeTree 依赖 WeakMap 记录
    // 原文，重复访问同一节点是幂等的）。
    const pendingRoots = new Set<Node>();
    let scheduled = false;
    const observe = () => {
      observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...LOCALIZED_ATTRIBUTES] });
    };
    const flush = () => {
      scheduled = false;
      observer.disconnect();
      for (const node of pendingRoots) localizeTree(node, language);
      pendingRoots.clear();
      observe();
    };
    const schedule = (node: Node) => {
      pendingRoots.add(node);
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') mutation.addedNodes.forEach(schedule);
        else schedule(mutation.target);
      }
    });
    localizeTree(root, language);
    observe();
    return () => observer.disconnect();
  }, [language]);

  return null;
}
