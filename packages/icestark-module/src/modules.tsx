import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Sandbox, { SandboxProps, SandboxContructor } from '@ice/sandbox';
import ModuleLoader, { StarkModule } from './loader';

type ISandbox = boolean | SandboxProps | SandboxContructor;

let globalModules = [];
let importModules = {};

const IS_CSS_REGEX = /\.css(\?((?!\.js$).)+)?$/;
export const moduleLoader = new ModuleLoader();

export const registerModules = (modules: StarkModule[]) => {
  globalModules = modules;
};

export const clearModules = () => {
  // reset module info
  globalModules = [];
  importModules = {};
  moduleLoader.clearTask();
};

/**
 * Render Component, compatible with Component and <Component>
 */
export function renderComponent(Component: any, props = {}): React.ReactElement {
  return React.isValidElement(Component) ? (
    React.cloneElement(Component, props)
  ) : (
    // eslint-disable-next-line react/jsx-filename-extension
    <Component {...props} />
  );
}

/**
 * support react module render
 */
const defaultMount = (Component: any, targetNode: HTMLElement, props?: any) => {
  console.warn('Please set mount, try run react mount function');
  try {
    ReactDOM.render(renderComponent(Component, props), targetNode);
  // eslint-disable-next-line no-empty
  } catch(err) {}
};

/**
 * default unmount function
 */
const defaultUnmount = (targetNode: HTMLElement) => {
  console.warn('Please set unmount, try run react unmount function');
  try {
    ReactDOM.unmountComponentAtNode(targetNode);
  // eslint-disable-next-line no-empty
  } catch(err) {}
};

function createSandbox(sandbox: ISandbox) {
  let moduleSandbox = null;
  if (sandbox) {
    if (typeof sandbox === 'function') {
      // eslint-disable-next-line new-cap
      moduleSandbox = new sandbox();
    } else {
      const sandboxProps = typeof sandbox === 'boolean' ? {} : sandbox;
      moduleSandbox = new Sandbox(sandboxProps);
    }
  }
  return moduleSandbox;
}

/**
 * parse url assets
 */
const parseUrlAssets = (assets: string | string[]) => {
  const jsList = [];
  const cssList = [];
  (Array.isArray(assets) ? assets : [assets]).forEach(url => {
    const isCss: boolean = IS_CSS_REGEX.test(url);
    if (isCss) {
      cssList.push(url);
    } else {
      jsList.push(url);
    }
  });

  return { jsList, cssList };
};


export function appendCSS(
  name: string,
  url: string,
  root: HTMLElement | ShadowRoot = document.getElementsByTagName('head')[0],
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!root) reject(new Error(`no root element for css assert: ${url}`));

    const element: HTMLLinkElement = document.createElement('link');
    element.setAttribute('module', name);
    element.rel = 'stylesheet';
    element.href = url;

    element.addEventListener(
      'error',
      () => {
        console.error(`css asset loaded error: ${url}`);
        return resolve();
      },
      false,
    );
    element.addEventListener('load', () => resolve(), false);

    root.appendChild(element);
  });
}

/**
 * remove css
 */

export function removeCSS(name: string) {
  const linkList: NodeListOf<HTMLElement> = document.querySelectorAll(
    `link[module=${name}]`,
  );
  linkList.forEach(link => {
    link.parentNode.removeChild(link);
  });
}

/**
 * return globalModules
*/
export const getModules = function () {
  return globalModules || [];
};

/**
 * mount module function
 */
export const mountModule = async (targetModule: StarkModule, targetNode: HTMLElement, props: any = {}, sandbox?: ISandbox) => {
  const { name, url } = targetModule;
  let moduleSandbox = null;
  if (!importModules[name]) {
    const { jsList, cssList } = parseUrlAssets(url);
    moduleSandbox = createSandbox(sandbox);
    const moduleInfo = await moduleLoader.execModule({ name, url: jsList }, moduleSandbox);
    importModules[name] = {
      moduleInfo,
      moduleSandbox,
      moduleCSS: cssList,
    };
  }

  const { moduleInfo, moduleCSS } = importModules[name];

  if (!moduleInfo) {
    console.error('load or exec module faild');
    return;
  }

  const mount = targetModule.mount || moduleInfo?.mount || defaultMount;
  const component = moduleInfo.default || moduleInfo;

  // append css before mount module
  if (moduleCSS.length) {
    return Promise.all(moduleCSS.map((css: string) => appendCSS(name, css))).then(() => mount(component, targetNode, props));
  } else {
    return new Promise(() => mount(component, targetNode, props));
  }
};

/**
 * unmount module function
 */
export const unmoutModule = (targetModule: StarkModule, targetNode: HTMLElement) => {
  const { name } = targetModule;
  const moduleInfo = importModules[name]?.module;
  const moduleSandbox = importModules[name]?.moduleSandbox;
  const unmount = targetModule.unmount || moduleInfo?.unmount || defaultUnmount;
  removeCSS(name);
  if (moduleSandbox?.clear) {
    moduleSandbox.clear();
  }

  return unmount(targetNode);
};

/**
 * default render compoent, mount all modules
 */
export class MicroModule extends React.Component<any, {}> {
  private moduleInfo = null;

  private mountNode = null;

  componentDidMount() {
    this.mountModule();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.moduleInfo !== this.props.moduleInfo || prevProps.name !== this.props.name) {
      this.mountModule();
    }
  }

  componentWillUnmount() {
    unmoutModule(this.moduleInfo, this.mountNode);
  }

  mountModule() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sandbox, moduleInfo, wrapperClassName, wrapperStyle, ...rest } = this.props;
    this.moduleInfo = moduleInfo || getModules().filter(m => m.name === this.props.moduleName)[0];
    if (!this.moduleInfo) {
      console.error(`Can't find ${this.props.moduleName} module in modules config`);
      return;
    }

    mountModule(this.moduleInfo, this.mountNode, rest, sandbox);
  }

  render() {
    const { wrapperClassName, wrapperStyle } = this.props;
    return (<div className={wrapperClassName} style={wrapperStyle} ref={ref => this.mountNode = ref} />);
  }
};

/**
 * Render Modules, compatible with Render and <Render>
 */
export default function renderModules(modules: StarkModule[], render: any, componentProps?: any, sandbox?: ISandbox): React.ReactElement {
  // save match app modules in global
  registerModules(modules);

  if (render) {
    return renderComponent(render, {
      modules,
      ...componentProps,
      sandbox,
    });
  }

  console.warn('Please set render Component, try use MicroModule and mount first module');
  return <MicroModule moduleName={modules[0]?.name} {...componentProps} />;
};