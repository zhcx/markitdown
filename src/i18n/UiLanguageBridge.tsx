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

    let applying = false;
    const apply = (node: Node) => {
      if (applying) return;
      applying = true;
      observer.disconnect();
      localizeTree(node, language);
      observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...LOCALIZED_ATTRIBUTES] });
      applying = false;
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') mutation.addedNodes.forEach(apply);
        else apply(mutation.target);
      }
    });
    apply(root);
    return () => observer.disconnect();
  }, [language]);

  return null;
}
