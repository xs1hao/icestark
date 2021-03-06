import Sandbox from '@ice/sandbox';
import { getGlobalProp, noteGlobalProps } from './global';

export interface StarkModule {
  name: string;
  url: string;
  mount?: (Component: any, targetNode: HTMLElement, props?: any) => void;
  unmount?: (targetNode: HTMLElement) => void;
};

export interface ImportTask {
  [name: string]: Promise<string>;
};

export type PromiseModule = Promise<Response>;

export interface Fetch {
  (input: RequestInfo, init?: RequestInit): Promise<Response>;
}

export default class ModuleLoader {
  private importTask: ImportTask = {};

  load(starkModule: StarkModule, fetch: Fetch = window.fetch): Promise<string> {
    const { url, name } = starkModule;
    if (this.importTask[name]) {
      // return promise if current module is pending or resolved
      return this.importTask[name];
    }
    const task = fetch(url).then((res) => res.text());
    this.importTask[name] = task;
    return task;
  }

  clearTask() {
    this.importTask = {};
  }

  execModule(starkModule: StarkModule, sandbox?: Sandbox) {
    return this.load(starkModule).then((source) => {
      let globalWindow = null;
      if (sandbox?.getSandbox) {
        sandbox.createProxySandbox();
        globalWindow = sandbox.getSandbox();
      } else {
        globalWindow = window;
      }
      noteGlobalProps(globalWindow);
      // check sandbox
      if (sandbox?.execScriptInSandbox) {
        sandbox.execScriptInSandbox(source);
      } else {
        // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/eval
        // eslint-disable-next-line no-eval
        (0, eval)(source);
      }
      const { name } = starkModule;
      const libraryExport = getGlobalProp(globalWindow);

      return (globalWindow as any)[name] || (globalWindow as any)[libraryExport] || {};
    });
  }
};