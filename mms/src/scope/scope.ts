// Scope - Scope class

import { doc, win } from '../core/consts';
import { scope, globals } from '../core/globals';
import { isFnc, mergeObjects } from '../core/helpers';
import { parseTargets } from '../core/targets';
import { keepTime } from '../utils/time';
import type {
  Tickable,
  ScopeParams,
  DOMTarget,
  ReactRef,
  AngularRef,
  DOMTargetSelector,
  DefaultsParams,
  ScopeConstructorCallback,
  ScopeCleanupCallback,
  Revertible,
  ScopeMethod,
  ScopedCallback,
} from '../types';

export class Scope {
  defaults: DefaultsParams;
  root: Document | DOMTarget;
  constructors: ScopeConstructorCallback[] = [];
  revertConstructors: ScopeCleanupCallback[] = [];
  revertibles: Revertible[] = [];
  constructorsOnce: (ScopeConstructorCallback | ((scope: Scope) => Tickable))[] = [];
  revertConstructorsOnce: ScopeCleanupCallback[] = [];
  revertiblesOnce: Revertible[] = [];
  once: boolean = false;
  onceIndex: number = 0;
  methods: Record<string, ScopeMethod> = {};
  matches: Record<string, boolean> = {};
  mediaQueryLists: Record<string, MediaQueryList> = {};
  data: Record<string, unknown> = {};

  constructor(parameters: ScopeParams = {}) {
    if (scope.current) scope.current.register(this);
    const rootParam = parameters.root;
    let root: Document | DOMTarget = doc!;
    if (rootParam) {
      root = (rootParam as ReactRef).current ||
             (rootParam as AngularRef).nativeElement ||
             parseTargets(rootParam as DOMTargetSelector)[0] ||
             doc!;
    }
    const scopeDefaults = parameters.defaults;
    const globalDefault = globals.defaults;
    const mediaQueries = parameters.mediaQueries;
    this.defaults = scopeDefaults ? mergeObjects(scopeDefaults, globalDefault) as DefaultsParams : globalDefault;
    this.root = root;

    if (mediaQueries) {
      for (const mq in mediaQueries) {
        const _mq = win!.matchMedia(mediaQueries[mq]);
        this.mediaQueryLists[mq] = _mq;
        _mq.addEventListener('change', this as unknown as EventListener);
      }
    }
  }

  register(revertible: Revertible): void {
    const store = this.once ? this.revertiblesOnce : this.revertibles;
    store.push(revertible);
  }

  execute<T>(cb: ScopedCallback<T>): T {
    const activeScope = scope.current;
    const activeRoot = scope.root;
    const activeDefaults = globals.defaults;
    scope.current = this;
    scope.root = this.root;
    globals.defaults = this.defaults;
    const mqs = this.mediaQueryLists;
    for (const mq in mqs) this.matches[mq] = mqs[mq].matches;
    const returned = cb(this);
    scope.current = activeScope;
    scope.root = activeRoot;
    globals.defaults = activeDefaults;
    return returned;
  }

  refresh(): this {
    this.onceIndex = 0;
    this.execute(() => {
      let i = this.revertibles.length;
      let y = this.revertConstructors.length;
      while (i--) this.revertibles[i].revert();
      while (y--) this.revertConstructors[y](this);
      this.revertibles.length = 0;
      this.revertConstructors.length = 0;
      this.constructors.forEach((constructor: ScopeConstructorCallback) => {
        const revertConstructor = constructor(this);
        if (isFnc(revertConstructor)) {
          this.revertConstructors.push(revertConstructor as ScopeCleanupCallback);
        }
      });
    });
    return this;
  }

  add(a1: string, a2: ScopeMethod): this;
  add(a1: ScopeConstructorCallback): this;
  add(a1: string | ScopeConstructorCallback, a2?: ScopeMethod): this {
    this.once = false;
    if (isFnc(a1)) {
      const constructor = a1 as ScopeConstructorCallback;
      this.constructors.push(constructor);
      this.execute(() => {
        const revertConstructor = constructor(this);
        if (isFnc(revertConstructor)) {
          this.revertConstructors.push(revertConstructor as ScopeCleanupCallback);
        }
      });
    } else {
      this.methods[a1 as string] = (...args: unknown[]) => this.execute(() => a2!(...args));
    }
    return this;
  }

  addOnce(scopeConstructorCallback: ScopeConstructorCallback): this {
    this.once = true;
    if (isFnc(scopeConstructorCallback)) {
      const currentIndex = this.onceIndex++;
      const tracked = this.constructorsOnce[currentIndex];
      if (tracked) return this;
      const constructor = scopeConstructorCallback;
      this.constructorsOnce[currentIndex] = constructor;
      this.execute(() => {
        const revertConstructor = constructor(this);
        if (isFnc(revertConstructor)) {
          this.revertConstructorsOnce.push(revertConstructor as ScopeCleanupCallback);
        }
      });
    }
    return this;
  }

  keepTime(cb: (scope: Scope) => Tickable): Tickable | undefined {
    this.once = true;
    const currentIndex = this.onceIndex++;
    const tracked = this.constructorsOnce[currentIndex] as ((scope: Scope) => Tickable) | undefined;
    if (isFnc(tracked)) return tracked!(this);
    const constructor = keepTime(cb) as (scope: Scope) => Tickable;
    this.constructorsOnce[currentIndex] = constructor;
    let trackedTickable: Tickable | undefined;
    this.execute(() => {
      trackedTickable = constructor(this);
    });
    return trackedTickable;
  }

  handleEvent(e: Event): void {
    switch (e.type) {
      case 'change':
        this.refresh();
        break;
    }
  }

  revert(): void {
    const revertibles = this.revertibles;
    const revertConstructors = this.revertConstructors;
    const revertiblesOnce = this.revertiblesOnce;
    const revertConstructorsOnce = this.revertConstructorsOnce;
    const mqs = this.mediaQueryLists;
    let i = revertibles.length;
    let j = revertConstructors.length;
    let k = revertiblesOnce.length;
    let l = revertConstructorsOnce.length;
    while (i--) revertibles[i].revert();
    while (j--) revertConstructors[j](this);
    while (k--) revertiblesOnce[k].revert();
    while (l--) revertConstructorsOnce[l](this);
    for (const mq in mqs) mqs[mq].removeEventListener('change', this as unknown as EventListener);
    revertibles.length = 0;
    revertConstructors.length = 0;
    this.constructors.length = 0;
    revertiblesOnce.length = 0;
    revertConstructorsOnce.length = 0;
    this.constructorsOnce.length = 0;
    this.onceIndex = 0;
    this.matches = {};
    this.methods = {};
    this.mediaQueryLists = {};
    this.data = {};
  }
}

export function createScope(params?: ScopeParams): Scope {
  return new Scope(params);
}
