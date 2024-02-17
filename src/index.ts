type None = void | undefined | null;

const isNone = (v: any): v is None => v === undefined || v === null;

export type EventName =
  | "on"
  | "off"
  | "change"
  | "reset"
  | "update"
  | "init"
  | "pause"
  | "resume";

export const events = Object.freeze({
  ON: "on",
  OFF: "off",
  CHANGE: "change",
  RESET: "reset",
  UPDATE: "update",
  INIT: "init",
  PAUSE: "pause",
  RESUME: "resume",
});

export type StoreUpdatedDict<T extends object> = Partial<T>;

export type StoreListener<T extends object> = (
  store: Store<T>,
  updatedDict: StoreUpdatedDict<T>
) => void;

export type StoreSetter<T extends object> = (
  store: Store<T>
) =>
  | None
  | Partial<T>
  | Promise<None>
  | Promise<Partial<T>>
  | Promise<None | Partial<T>>;

export type Store<T extends object> = T & {
  readonly $assign: (
    o: StoreSetter<Store<T>> | Partial<T> | None,
    dispatch?: boolean
  ) => Promise<T>;
  readonly $on: ((callback: StoreListener<T>) => () => void) &
    ((event: EventName, callback: StoreListener<T>) => () => void);
  readonly $off: ((callback: StoreListener<T>) => void) &
    ((event: EventName, callback: StoreListener<T>) => void);
  readonly $object: T;
};

type AutoUpdatable<T extends object> = T & {
  $interval: number; // milliseconds
  readonly $update: () => Promise<T>;
  readonly $updating: boolean;
  readonly $lastUpdated: Date;
  readonly $paused: boolean;
  readonly $pause: () => void;
  readonly $resume: () => void;
};

type LazyAutoUpdatable<T extends object> = AutoUpdatable<T> & {
  $timeout: number;
  readonly $lastActived: Date;
  readonly $lazyUpdate: () => Promise<T>;
  readonly $active: () => void;
};

type InitNeeded<T extends object> = T & {
  readonly $init: () => Promise<T>;
  readonly $inited: boolean;
  readonly $initing: boolean;
};

type Resettable<T, InitialValue = T> = T & {
  readonly $initial: InitialValue;
  readonly $reset: () => InitialValue;
};

type StoreOptions<T extends object> = Partial<{
  updatable: boolean | "lazy";
  update: StoreSetter<T>;
  interval: number;
  timeout: number;
  initNeeded: boolean | "lazy" | "immediate" | number;
  init: StoreSetter<T>;
  resettable: boolean;
}>;

type AutoUpdatableOption<T extends object> = {
  updatable: true;
  update: StoreSetter<T>;
  interval?: number | None;
} & StoreOptions<T>;

type LazyAutoUpdatableOption<T extends object> = {
  updatable: "lazy";
  update: StoreSetter<T>;
  interval: number;
  timeout: number;
} & StoreOptions<T>;

/**
 * If the store is also updatable, `init()` is defaulted to `update()`.\
 * when initNeed is 'lazy', the store init at `$on()` called.\
 * when initNeed is 'immediate', the store init at store created.\
 * when initNeed is a `n` number, the store init `n` millisecond after store created.
 * `init()` return the current value of the store.
 */
type InitNeededOption<T extends object> = {
  initNeeded: true | "lazy" | "immediate" | number;
} & (
  | {
      update: StoreSetter<T>;
    }
  | {
      init: StoreSetter<T>;
    }
) &
  StoreOptions<T>;

type ResettableOption<T extends object> = {
  resettable: true;
} & StoreOptions<T>;

function store<T extends object>(
  data: T,
  options: AutoUpdatableOption<T> & ResettableOption<T> & InitNeededOption<T>
): Store<AutoUpdatable<T> & Resettable<T> & InitNeeded<T>>;

function store<T extends object>(
  data: T,
  options: LazyAutoUpdatableOption<T> &
    ResettableOption<T> &
    InitNeededOption<T>
): Store<LazyAutoUpdatable<T> & Resettable<T> & InitNeeded<T>>;

function store<T extends object>(
  data: T,
  options: AutoUpdatableOption<T> & InitNeededOption<T>
): Store<AutoUpdatable<T> & InitNeeded<T>>;

function store<T extends object>(
  data: T,
  options: AutoUpdatableOption<T> & ResettableOption<T>
): Store<AutoUpdatable<T> & Resettable<T>>;

function store<T extends object>(
  data: T,
  options: LazyAutoUpdatableOption<T> & InitNeededOption<T>
): Store<LazyAutoUpdatable<T> & InitNeeded<T>>;

function store<T extends object>(
  data: T,
  options: LazyAutoUpdatableOption<T> & ResettableOption<T>
): Store<LazyAutoUpdatable<T> & Resettable<T>>;

function store<T extends object>(
  data: T,
  options: ResettableOption<T> & InitNeededOption<T>
): Store<Resettable<T> & InitNeeded<T>>;

function store<T extends object>(
  data: T,
  options: AutoUpdatableOption<T>
): Store<AutoUpdatable<T>>;

function store<T extends object>(
  data: T,
  options: LazyAutoUpdatableOption<T>
): Store<LazyAutoUpdatable<T>>;

function store<T extends object>(
  data: T,
  options: InitNeededOption<T>
): Store<InitNeeded<T>>;

function store<T extends object>(
  data: T,
  options: ResettableOption<T>
): Store<Resettable<T>>;

function store<T extends object>(data: T, options?: StoreOptions<T>): Store<T>;

function store<T extends object>(data: T, options: StoreOptions<T> = {}) {
  if (typeof data !== "object") throw new Error("Data must be an object");

  const listeners = new Map<EventName, Set<StoreListener<T>>>();

  const dispatchEvent = (
    eventName: EventName,
    updatedDict: StoreUpdatedDict<T> = {}
  ) => {
    const eventListenerSet = listeners.get(eventName);
    if (!eventListenerSet) return;
    eventListenerSet.forEach(async (callback) => callback(proxy, updatedDict));
  };

  const $assign = async (
    obj?: None | Partial<T> | StoreSetter<T>,
    dispatch = true
  ): Promise<T> => {
    if (!obj) return data;
    if (typeof obj === "function") {
      return await $assign(await obj(proxy), dispatch);
    }
    if (Array.isArray(obj) && Array.isArray(data)) {
      data.splice(0, data.length);
      for (let i = 0; i < obj.length; i++) data[i] = obj[i];
    } else {
      Object.assign(data, obj);
    }
    if (dispatch) {
      dispatchEvent(events.CHANGE, obj);
    }
    return data;
  };

  const $on = (
    eventName: EventName | StoreListener<T>,
    listener?: StoreListener<T>
  ): (() => void) => {
    if (listener === undefined) {
      if (typeof eventName !== "function")
        throw new Error("Listener must be a function");
      return $on(events.CHANGE, eventName);
    }
    if (typeof eventName !== "string")
      throw new Error("Event name must be a string");
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    const eventListenerSet = listeners.get(eventName)!;
    eventListenerSet.add(listener);
    dispatchEvent(events.ON);
    return () => $off(eventName, listener);
  };

  const $off = (
    eventName: EventName | StoreListener<T>,
    listener?: StoreListener<T>
  ): void => {
    if (listener === undefined) {
      if (typeof eventName !== "function")
        throw new Error("Listener must be a function");
      return $off(events.CHANGE, eventName);
    }
    if (typeof eventName !== "string")
      throw new Error("Event name must be a string");
    if (!listeners.has(eventName)) return;
    listeners.get(eventName)!.delete(listener);
    dispatchEvent(events.OFF);
  };

  const proxy: Store<T> = new Proxy(data, {
    get(target, key) {
      return key in storeProps
        ? (storeProps as any)[key]
        : (target as T)[key as keyof T];
    },
    set(target, key, value) {
      if (key in storeProps) {
        (storeProps as any)[key] = value;
        return true;
      }
      const updatedDict = { [key]: value } as Partial<T>;
      $assign(updatedDict);
      return true;
    },
  }) as Store<T>;

  const storeProps = {
    $on,
    $off,
    $assign,
    get $object() {
      return data;
    },
  } as Partial<
    Store<
      AutoUpdatable<T> & LazyAutoUpdatable<T> & InitNeeded<T> & Resettable<T>
    >
  >;

  const {
    updatable = false,
    update,
    interval = NaN,
    timeout = NaN,
    initNeeded = false,
    init,
    resettable = false,
  } = options;

  if (typeof update === "function" && updatable) {
    let $updating = false;
    let $lastUpdated = new Date();
    let $interval = isNone(interval) ? NaN : interval;
    let autoUpdateTimeout: NodeJS.Timeout;

    const $update = async () => {
      try {
        clearTimeout(autoUpdateTimeout);
        $updating = true;
        await $assign(update);
        dispatchEvent(events.UPDATE);
      } catch (e) {
        console.error(e);
      } finally {
        $updating = false;
        $lastUpdated = new Date();
        if (!$paused && typeof $interval === "number" && !isNaN($interval)) {
          autoUpdateTimeout = setTimeout($update, $interval);
        }
      }
      return data;
    };

    let $paused = false;

    Object.defineProperties(storeProps, {
      $interval: {
        get() {
          return $interval;
        },
        set(v) {
          $interval = isNone(v) ? NaN : Number(v);
        },
      },
      $update: {
        value: $update,
      },
      $updating: {
        get() {
          return $updating;
        },
      },
      $lastUpdated: {
        get() {
          return $lastUpdated;
        },
      },
      $paused: {
        get() {
          return $paused;
        },
      },
      $pause: {
        value: () => {
          $paused = true;
          dispatchEvent(events.PAUSE);
          clearTimeout(autoUpdateTimeout);
        },
      },
      $resume: {
        value: () => {
          $paused = false;
          dispatchEvent(events.RESUME);
          if (typeof $interval === "number" && !isNaN($interval)) {
            autoUpdateTimeout = setTimeout(
              $update,
              Math.max(0, $interval - Date.now() - $lastUpdated.getTime())
            );
          }
        },
      },
    });

    if (updatable === "lazy") {
      let $timeout = isNone(timeout) ? NaN : timeout;
      let $lastActived = new Date();

      const $active = () => {
        $lastActived = new Date();
        if ($paused) storeProps.$resume!();
      };

      $on(events.UPDATE, () => {
        if ($lastActived.getTime() + $timeout < Date.now()) {
          storeProps.$pause!();
        }
      });

      const $lazyUpdate = async () => {
        if ($lastActived.getTime() + $timeout > Date.now())
          return await $update();
        return data;
      };

      Object.defineProperties(storeProps, {
        $active: {
          value: $active,
        },
        $lazyUpdate: {
          value: $lazyUpdate,
        },
        $timeout: {
          get() {
            return $timeout;
          },
          set(v) {
            $timeout = isNone(v) ? NaN : Number(v);
          },
        },
        $lastActived: {
          get() {
            return $lastActived;
          },
        },
      });
    }
  }

  if (typeof initNeeded === "number" || initNeeded) {
    let $inited: Promise<T> | boolean = false;
    let $initing = false;

    const $init = async () => {
      if ($inited || $initing) {
        await $inited;
        return data;
      }
      dispatchEvent(events.INIT);
      $initing = true;
      try {
        $inited = (async () => await $assign(await (init || update)!(proxy)))();
        await $inited;
      } catch (e) {
        console.error(e);
      } finally {
        $initing = false;
        $inited = true;
      }
      return data;
    };

    switch (initNeeded) {
      case "immediate": {
        $init();
        break;
      }
      case "lazy": {
        $on(events.ON, $init);
        break;
      }
      default:
        if (typeof initNeeded === "number") {
          setTimeout($init, initNeeded);
        }
    }

    Object.defineProperties(storeProps, {
      $inited: {
        get() {
          return Boolean($inited);
        },
      },
      $initing: {
        get() {
          return $initing;
        },
      },
      $init: {
        value: $init,
      },
    });
  }

  if (resettable) {
    Object.defineProperties(storeProps, {
      $initial: { value: { ...data } },
      $reset: {
        value: () => {
          $assign(storeProps.$initial);
          dispatchEvent(events.RESET);
          return;
        },
      },
    });
  }

  return proxy;
}

export default store;
