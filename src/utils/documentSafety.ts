export interface DocumentSnapshot { activeTabId: string | null; content: string }

/** 保存顺序与请求顺序一致，失败不阻塞后续保存。 */
export function createSaveQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(write: () => Promise<T>): Promise<T> {
    const result = tail.then(write);
    tail = result.catch(() => undefined);
    return result;
  };
}

export function sameDocument(a: DocumentSnapshot, b: DocumentSnapshot): boolean {
  return a.activeTabId !== null && a.activeTabId === b.activeTabId && a.content === b.content;
}

/** 每个标签拥有自己的模型和撤销栈，切换显示模式时也可复用。 */
export class DocumentSessions<T extends { dispose(): void }> {
  private sessions = new Map<string, T>();
  get(id: string, create: () => T): T {
    let session = this.sessions.get(id);
    if (!session) { session = create(); this.sessions.set(id, session); }
    return session;
  }
  retain(ids: string[]) {
    for (const [id, session] of this.sessions) {
      if (!ids.includes(id)) { session.dispose(); this.sessions.delete(id); }
    }
  }
}
