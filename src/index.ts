type None = void | undefined | null;

const isNone = (v: any): v is None => v === undefined || v === null;

const defProp = <O extends object>(o: O, k: keyof O, value: any): O =>
  Object.defineProperty(o, k, {
    value,
    writable: false,
    configurable: true,
  });

const defGetter = <O extends object, T>(
  o: O,
  k: keyof O,
  getter: () => T,
  setter?: (v: T) => void
): O =>
  Object.defineProperty(o, k, {
    get: getter,
    set: setter,
    configurable: true,
  });

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

type EventListenerMap<T extends object> = Map<EventName, Set<StoreListener<T>>>;

const dispatchEvent = <T extends object>(
  store: Store<T>,
  listeners: EventListenerMap<T>,
  eventName: EventName,
  updatedDict: StoreUpdatedDict<T> = {}
) => {
  const eventListenerSet = listeners.get(eventName);
  if (!eventListenerSet) return;
  eventListenerSet.forEach(async (callback) => callback(store, updatedDict));
};

const addListener = <T extends object>(
  store: Store<T>,
  listeners: EventListenerMap<T>,
  eventName: EventName | StoreListener<T>,
  listener?: StoreListener<T>
): (() => void) => {
  if (listener === undefined) {
    if (typeof eventName !== "function")
      throw new Error("Listener must be a function");
    return addListener(store, listeners, events.CHANGE, eventName);
  }
  if (typeof eventName !== "string")
    throw new Error("Event name must be a string");
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  const eventListenerSet = listeners.get(eventName)!;
  eventListenerSet.add(listener);
  dispatchEvent(store, listeners, events.ON);
  return () => removeListener(store, listeners, eventName, listener);
};

const removeListener = <T extends object>(
  store: Store<T>,
  listeners: EventListenerMap<T>,
  eventName: EventName | StoreListener<T>,
  listener?: StoreListener<T>
): void => {
  if (listener === undefined) {
    if (typeof eventName !== "function")
      throw new Error("Listener must be a function");
    return removeListener(store, listeners, events.CHANGE, eventName);
  }
  if (typeof eventName !== "string")
    throw new Error("Event name must be a string");
  if (!listeners.has(eventName)) return;
  listeners.get(eventName)!.delete(listener);
  dispatchEvent(store, listeners, events.OFF);
};

const assignObject = async <T extends object>(
  store: Store<T>,
  listeners: EventListenerMap<T>,
  targer: T,
  obj?: None | Partial<T> | StoreSetter<T>,
  dispatch = true
): Promise<void> => {
  if (!obj) return;
  if (typeof obj === "function") {
    return await store.$assign(await obj(store), dispatch);
  }
  if (Array.isArray(obj) && Array.isArray(targer)) {
    targer.length = 0;
    obj.map((i, v) => (targer[i] = v));
  } else {
    Object.assign(targer, obj);
  }
  if (dispatch) {
    dispatchEvent(store, listeners, events.CHANGE, obj);
  }
};

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
    o: StoreSetter<T> | Partial<T> | None,
    dispatch?: boolean
  ) => Promise<void>;
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
  readonly $init: (force?: boolean) => Promise<T>;
  readonly $inited: boolean;
  readonly $initing: boolean;
};

type Resettable<T> = T & {
  readonly $initial: T;
  readonly $reset: () => Promise<T>;
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
  update: StoreSetter<T>;
  updatable?: true;
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
type InitNeededOption<T extends object> = (
  | {
      initNeeded?: true;
      init: StoreSetter<T>;
    }
  | ({
      initNeeded: true | "lazy" | "immediate" | number;
    } & (
      | {
          update: StoreSetter<T>;
        }
      | {
          init: StoreSetter<T>;
        }
    ))
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

  const listeners: EventListenerMap<T> = new Map();

  const store: Store<T> = new Proxy(data, {
    get(target, key) {
      return key in props ? (props as any)[key] : (target as T)[key as keyof T];
    },
    set(target, key, value) {
      const updatedDict = { [key]: value } as Partial<T>;
      if (key in props) {
        (props as any)[key] = value;
        dispatchEvent(store, listeners, events.CHANGE, updatedDict);
        return true;
      }
      props.$assign(updatedDict);
      return true;
    },
  }) as Store<T>;

  const props = {} as Store<T> &
    Partial<
      Store<
        AutoUpdatable<T> & LazyAutoUpdatable<T> & InitNeeded<T> & Resettable<T>
      >
    >;

  defProp(
    props,
    "$on",
    (
      eventName: EventName | StoreListener<T>,
      listener?: StoreListener<T>
    ): (() => void) => addListener(store, listeners, eventName, listener)
  );

  defProp(
    props,
    "$off",
    (
      eventName: EventName | StoreListener<T>,
      listener?: StoreListener<T>
    ): void => removeListener(store, listeners, eventName, listener)
  );

  defProp(
    props,
    "$assign",
    async (obj?: None | Partial<T> | StoreSetter<T>, dispatch = true) =>
      assignObject(store, listeners, data, obj, dispatch)
  );

  defGetter(props, "$object", () => data);

  const {
    updatable = false,
    update,
    initNeeded = false,
    init,
    resettable = false,
  } = options;

  let { timeout = NaN, interval = NaN } = options;

  if (typeof update === "function") {
    let autoUpdateTimeout: NodeJS.Timeout;

    defGetter(
      props,
      "$interval",
      () => interval,
      (v) => (interval = isNone(v) ? NaN : v)
    );
    defProp(props, "$lastUpdated", new Date());
    defProp(props, "$updating", false);

    defProp(props, "$update", async () => {
      try {
        clearTimeout(autoUpdateTimeout);
        defProp(props, "$updating", true);
        await props.$assign(update);
        dispatchEvent(store, listeners, events.UPDATE);
      } catch (e) {
        console.error(e);
      } finally {
        defProp(props, "$updating", false);
        defProp(props, "$lastUpdated", new Date());
        if (
          !props.$paused &&
          typeof props.$interval === "number" &&
          !isNaN(props.$interval)
        )
          autoUpdateTimeout = setTimeout(props.$update!, props.$interval);
      }
      return data;
    });

    defProp(props, "$pause", () => {
      defProp(props, "$paused", true);
      dispatchEvent(store, listeners, events.PAUSE);
      clearTimeout(autoUpdateTimeout);
    });

    defProp(props, "$resume", () => {
      if (!props.$paused) return;
      defProp(props, "$paused", false);
      dispatchEvent(store, listeners, events.RESUME);
      if (typeof props.$interval === "number" && !isNaN(props.$interval))
        autoUpdateTimeout = setTimeout(
          props.$update!,
          Math.max(
            0,
            props.$interval - Date.now() - props.$lastUpdated!.getTime()
          )
        );
    });

    if (updatable === "lazy") {
      defGetter(
        props,
        "$timeout",
        () => timeout,
        (v) => (timeout = isNone(v) ? NaN : v)
      );

      defProp(props, "$lastActived", new Date());

      defProp(props, "$active", () => {
        defProp(props, "$lastActived", new Date());
        if (props.$paused) props.$resume!();
      });

      defProp(props, "$lazyUpdate", async () => {
        if (props.$lastActived!.getTime() + timeout > Date.now())
          return await props.$update!();
        return data;
      });

      props.$on(events.UPDATE, () => {
        if (props.$lastActived!.getTime() + timeout < Date.now()) {
          props.$pause!();
        }
      });
    }
  }

  if (
    typeof initNeeded === "number" ||
    typeof init === "function" ||
    initNeeded
  ) {
    let initPromise: Promise<void> | void = void 0;

    defProp(props, "$inited", false);
    defProp(props, "$initing", false);
    defProp(props, "$init", async (force = false) => {
      if (!force && (initPromise || props.$initing)) {
        await initPromise;
        return data;
      }
      try {
        defProp(props, "$initing", true);
        defProp(props, "$inited", false);
        dispatchEvent(store, listeners, events.INIT);
        initPromise = (async () =>
          await props.$assign(await (init || update)!(store)))();
        await initPromise;
        initPromise = void 0;
      } catch (e) {
        console.error(e);
      } finally {
        defProp(props, "$initing", false);
        defProp(props, "$inited", true);
      }
      return data;
    });

    switch (initNeeded) {
      case "immediate": {
        props.$init!();
        break;
      }
      case "lazy": {
        props.$on(events.ON, () => props.$init!());
        break;
      }
      default:
        if (typeof initNeeded === "number")
          setTimeout(props.$init!, initNeeded);
    }
  }

  if (resettable) {
    defProp(props, "$initial", { ...data });
    defProp(props, "$reset", async () => {
      const initialValue = props.$initial;
      dispatchEvent(store, listeners, events.RESET);
      for (const i in data) delete data[i];
      props.$assign(props.$initial);
      return initialValue;
    });
  }

  return store;
}

export default store;
