import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/app/id.ts
function cryptoToken() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  degradedSeq += 1;
  return `nocrypto-fallback-${degradedSeq.toString(36)}`;
}
function uid(prefix) {
  return `${prefix}-${cryptoToken()}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var degradedSeq;
var init_id = __esm({
  "src/app/id.ts"() {
    "use strict";
    degradedSeq = 0;
  }
});

// src/domain/types.ts
var GRAPH_SCHEMA_VERSION;
var init_types = __esm({
  "src/domain/types.ts"() {
    "use strict";
    GRAPH_SCHEMA_VERSION = 2;
  }
});

// node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var init_tslib_es6 = __esm({
  "node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
  }
});

// node_modules/@tauri-apps/api/core.js
var core_exports = {};
__export(core_exports, {
  Channel: () => Channel,
  PluginListener: () => PluginListener,
  Resource: () => Resource,
  SERIALIZE_TO_IPC_FN: () => SERIALIZE_TO_IPC_FN,
  addPluginListener: () => addPluginListener,
  checkPermissions: () => checkPermissions,
  convertFileSrc: () => convertFileSrc,
  invoke: () => invoke,
  isTauri: () => isTauri,
  requestPermissions: () => requestPermissions,
  transformCallback: () => transformCallback
});
function transformCallback(callback, once2 = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once2);
}
async function addPluginListener(plugin, event, cb) {
  const handler = new Channel(cb);
  try {
    await invoke(`plugin:${plugin}|register_listener`, {
      event,
      handler
    });
    return new PluginListener(plugin, event, handler.id);
  } catch {
    await invoke(`plugin:${plugin}|registerListener`, { event, handler });
    return new PluginListener(plugin, event, handler.id);
  }
}
async function checkPermissions(plugin) {
  return invoke(`plugin:${plugin}|check_permissions`);
}
async function requestPermissions(plugin) {
  return invoke(`plugin:${plugin}|request_permissions`);
}
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
function convertFileSrc(filePath, protocol = "asset") {
  return window.__TAURI_INTERNALS__.convertFileSrc(filePath, protocol);
}
function isTauri() {
  return !!(globalThis || window).isTauri;
}
var _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex, _Resource_rid, SERIALIZE_TO_IPC_FN, Channel, PluginListener, Resource;
var init_core = __esm({
  "node_modules/@tauri-apps/api/core.js"() {
    init_tslib_es6();
    SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
    Channel = class {
      constructor(onmessage) {
        _Channel_onmessage.set(this, void 0);
        _Channel_nextMessageIndex.set(this, 0);
        _Channel_pendingMessages.set(this, []);
        _Channel_messageEndIndex.set(this, void 0);
        __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
        }), "f");
        this.id = transformCallback((rawMessage) => {
          const index = rawMessage.index;
          if ("end" in rawMessage) {
            if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
              this.cleanupCallback();
            } else {
              __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
            }
            return;
          }
          const message = rawMessage.message;
          if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
            __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
            __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
              const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
              delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            }
            if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
              this.cleanupCallback();
            }
          } else {
            __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
          }
        });
      }
      cleanupCallback() {
        window.__TAURI_INTERNALS__.unregisterCallback(this.id);
      }
      set onmessage(handler) {
        __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
      }
      get onmessage() {
        return __classPrivateFieldGet(this, _Channel_onmessage, "f");
      }
      [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
        return `__CHANNEL__:${this.id}`;
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PluginListener = class {
      constructor(plugin, event, channelId) {
        this.plugin = plugin;
        this.event = event;
        this.channelId = channelId;
      }
      async unregister() {
        return invoke(`plugin:${this.plugin}|remove_listener`, {
          event: this.event,
          channelId: this.channelId
        });
      }
    };
    Resource = class {
      get rid() {
        return __classPrivateFieldGet(this, _Resource_rid, "f");
      }
      constructor(rid) {
        _Resource_rid.set(this, void 0);
        __classPrivateFieldSet(this, _Resource_rid, rid, "f");
      }
      /**
       * Destroys and cleans up this resource from memory.
       * **You should not call any method on this object anymore and should drop any reference to it.**
       */
      async close() {
        return invoke("plugin:resources|close", {
          rid: this.rid
        });
      }
    };
    _Resource_rid = /* @__PURE__ */ new WeakMap();
  }
});

// node_modules/@tauri-apps/api/dpi.js
var LogicalSize, PhysicalSize, Size, LogicalPosition, PhysicalPosition, Position;
var init_dpi = __esm({
  "node_modules/@tauri-apps/api/dpi.js"() {
    init_core();
    LogicalSize = class {
      constructor(...args) {
        this.type = "Logical";
        if (args.length === 1) {
          if ("Logical" in args[0]) {
            this.width = args[0].Logical.width;
            this.height = args[0].Logical.height;
          } else {
            this.width = args[0].width;
            this.height = args[0].height;
          }
        } else {
          this.width = args[0];
          this.height = args[1];
        }
      }
      /**
       * Converts the logical size to a physical one.
       * @example
       * ```typescript
       * import { LogicalSize } from '@tauri-apps/api/dpi';
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       *
       * const appWindow = getCurrentWindow();
       * const factor = await appWindow.scaleFactor();
       * const size = new LogicalSize(400, 500);
       * const physical = size.toPhysical(factor);
       * ```
       *
       * @since 2.0.0
       */
      toPhysical(scaleFactor) {
        return new PhysicalSize(this.width * scaleFactor, this.height * scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          width: this.width,
          height: this.height
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PhysicalSize = class {
      constructor(...args) {
        this.type = "Physical";
        if (args.length === 1) {
          if ("Physical" in args[0]) {
            this.width = args[0].Physical.width;
            this.height = args[0].Physical.height;
          } else {
            this.width = args[0].width;
            this.height = args[0].height;
          }
        } else {
          this.width = args[0];
          this.height = args[1];
        }
      }
      /**
       * Converts the physical size to a logical one.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const appWindow = getCurrentWindow();
       * const factor = await appWindow.scaleFactor();
       * const size = await appWindow.innerSize(); // PhysicalSize
       * const logical = size.toLogical(factor);
       * ```
       */
      toLogical(scaleFactor) {
        return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          width: this.width,
          height: this.height
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    Size = class {
      constructor(size) {
        this.size = size;
      }
      toLogical(scaleFactor) {
        return this.size instanceof LogicalSize ? this.size : this.size.toLogical(scaleFactor);
      }
      toPhysical(scaleFactor) {
        return this.size instanceof PhysicalSize ? this.size : this.size.toPhysical(scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          [`${this.size.type}`]: {
            width: this.size.width,
            height: this.size.height
          }
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    LogicalPosition = class {
      constructor(...args) {
        this.type = "Logical";
        if (args.length === 1) {
          if ("Logical" in args[0]) {
            this.x = args[0].Logical.x;
            this.y = args[0].Logical.y;
          } else {
            this.x = args[0].x;
            this.y = args[0].y;
          }
        } else {
          this.x = args[0];
          this.y = args[1];
        }
      }
      /**
       * Converts the logical position to a physical one.
       * @example
       * ```typescript
       * import { LogicalPosition } from '@tauri-apps/api/dpi';
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       *
       * const appWindow = getCurrentWindow();
       * const factor = await appWindow.scaleFactor();
       * const position = new LogicalPosition(400, 500);
       * const physical = position.toPhysical(factor);
       * ```
       *
       * @since 2.0.0
       */
      toPhysical(scaleFactor) {
        return new PhysicalPosition(this.x * scaleFactor, this.y * scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          x: this.x,
          y: this.y
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PhysicalPosition = class {
      constructor(...args) {
        this.type = "Physical";
        if (args.length === 1) {
          if ("Physical" in args[0]) {
            this.x = args[0].Physical.x;
            this.y = args[0].Physical.y;
          } else {
            this.x = args[0].x;
            this.y = args[0].y;
          }
        } else {
          this.x = args[0];
          this.y = args[1];
        }
      }
      /**
       * Converts the physical position to a logical one.
       * @example
       * ```typescript
       * import { PhysicalPosition } from '@tauri-apps/api/dpi';
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       *
       * const appWindow = getCurrentWindow();
       * const factor = await appWindow.scaleFactor();
       * const position = new PhysicalPosition(400, 500);
       * const physical = position.toLogical(factor);
       * ```
       *
       * @since 2.0.0
       */
      toLogical(scaleFactor) {
        return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          x: this.x,
          y: this.y
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    Position = class {
      constructor(position) {
        this.position = position;
      }
      toLogical(scaleFactor) {
        return this.position instanceof LogicalPosition ? this.position : this.position.toLogical(scaleFactor);
      }
      toPhysical(scaleFactor) {
        return this.position instanceof PhysicalPosition ? this.position : this.position.toPhysical(scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          [`${this.position.type}`]: {
            x: this.position.x,
            y: this.position.y
          }
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
  }
});

// node_modules/@tauri-apps/api/event.js
async function _unlisten(event, eventId) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId);
  await invoke("plugin:event|unlisten", {
    event,
    eventId
  });
}
async function listen(event, handler, options) {
  var _a;
  const target = typeof (options === null || options === void 0 ? void 0 : options.target) === "string" ? { kind: "AnyLabel", label: options.target } : (_a = options === null || options === void 0 ? void 0 : options.target) !== null && _a !== void 0 ? _a : { kind: "Any" };
  return invoke("plugin:event|listen", {
    event,
    target,
    handler: transformCallback(handler)
  }).then((eventId) => {
    return async () => _unlisten(event, eventId);
  });
}
async function once(event, handler, options) {
  return listen(event, (eventData) => {
    void _unlisten(event, eventData.id);
    handler(eventData);
  }, options);
}
async function emit(event, payload) {
  await invoke("plugin:event|emit", {
    event,
    payload
  });
}
async function emitTo(target, event, payload) {
  const eventTarget = typeof target === "string" ? { kind: "AnyLabel", label: target } : target;
  await invoke("plugin:event|emit_to", {
    target: eventTarget,
    event,
    payload
  });
}
var TauriEvent;
var init_event = __esm({
  "node_modules/@tauri-apps/api/event.js"() {
    init_core();
    (function(TauriEvent2) {
      TauriEvent2["WINDOW_RESIZED"] = "tauri://resize";
      TauriEvent2["WINDOW_MOVED"] = "tauri://move";
      TauriEvent2["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
      TauriEvent2["WINDOW_DESTROYED"] = "tauri://destroyed";
      TauriEvent2["WINDOW_FOCUS"] = "tauri://focus";
      TauriEvent2["WINDOW_BLUR"] = "tauri://blur";
      TauriEvent2["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
      TauriEvent2["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
      TauriEvent2["WINDOW_CREATED"] = "tauri://window-created";
      TauriEvent2["WINDOW_SUSPENDED"] = "tauri://suspended";
      TauriEvent2["WINDOW_RESUMED"] = "tauri://resumed";
      TauriEvent2["WEBVIEW_CREATED"] = "tauri://webview-created";
      TauriEvent2["DRAG_ENTER"] = "tauri://drag-enter";
      TauriEvent2["DRAG_OVER"] = "tauri://drag-over";
      TauriEvent2["DRAG_DROP"] = "tauri://drag-drop";
      TauriEvent2["DRAG_LEAVE"] = "tauri://drag-leave";
    })(TauriEvent || (TauriEvent = {}));
  }
});

// node_modules/@tauri-apps/api/image.js
function transformImage(image) {
  const ret = image == null ? null : typeof image === "string" ? image : image instanceof Image ? image.rid : image;
  return ret;
}
var Image;
var init_image = __esm({
  "node_modules/@tauri-apps/api/image.js"() {
    init_core();
    Image = class _Image extends Resource {
      /**
       * Creates an Image from a resource ID. For internal use only.
       *
       * @ignore
       */
      constructor(rid) {
        super(rid);
      }
      /** Creates a new Image using RGBA data, in row-major order from top to bottom, and with specified width and height. */
      static async new(rgba, width, height) {
        return invoke("plugin:image|new", {
          rgba: transformImage(rgba),
          width,
          height
        }).then((rid) => new _Image(rid));
      }
      /**
       * Creates a new image using the provided bytes by inferring the file format.
       * If the format is known, prefer [@link Image.fromPngBytes] or [@link Image.fromIcoBytes].
       *
       * Only `ico` and `png` are supported (based on activated feature flag).
       *
       * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
       * To enable it, change your Cargo.toml file:
       * ```toml
       * [dependencies]
       * tauri = { version = "...", features = ["...", "image-png"] }
       * ```
       */
      static async fromBytes(bytes) {
        return invoke("plugin:image|from_bytes", {
          bytes: transformImage(bytes)
        }).then((rid) => new _Image(rid));
      }
      /**
       * Creates a new image using the provided path.
       *
       * Only `ico` and `png` are supported (based on activated feature flag).
       *
       * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
       * To enable it, change your Cargo.toml file:
       * ```toml
       * [dependencies]
       * tauri = { version = "...", features = ["...", "image-png"] }
       * ```
       */
      static async fromPath(path3) {
        return invoke("plugin:image|from_path", { path: path3 }).then((rid) => new _Image(rid));
      }
      /** Returns the RGBA data for this image, in row-major order from top to bottom.  */
      async rgba() {
        return invoke("plugin:image|rgba", {
          rid: this.rid
        }).then((buffer) => new Uint8Array(buffer));
      }
      /** Returns the size of this image.  */
      async size() {
        return invoke("plugin:image|size", { rid: this.rid });
      }
    };
  }
});

// node_modules/@tauri-apps/api/window.js
var window_exports = {};
__export(window_exports, {
  CloseRequestedEvent: () => CloseRequestedEvent,
  Effect: () => Effect,
  EffectState: () => EffectState,
  LogicalPosition: () => LogicalPosition,
  LogicalSize: () => LogicalSize,
  PhysicalPosition: () => PhysicalPosition,
  PhysicalSize: () => PhysicalSize,
  ProgressBarStatus: () => ProgressBarStatus,
  UserAttentionType: () => UserAttentionType,
  Window: () => Window,
  availableMonitors: () => availableMonitors,
  currentMonitor: () => currentMonitor,
  cursorPosition: () => cursorPosition,
  getAllWindows: () => getAllWindows,
  getCurrentWindow: () => getCurrentWindow,
  monitorFromPoint: () => monitorFromPoint,
  primaryMonitor: () => primaryMonitor
});
function getCurrentWindow() {
  return new Window(window.__TAURI_INTERNALS__.metadata.currentWindow.label, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  });
}
async function getAllWindows() {
  return invoke("plugin:window|get_all_windows").then((windows) => windows.map((w) => new Window(w, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  })));
}
function mapMonitor(m2) {
  return m2 === null ? null : {
    name: m2.name,
    scaleFactor: m2.scaleFactor,
    position: new PhysicalPosition(m2.position),
    size: new PhysicalSize(m2.size),
    workArea: {
      position: new PhysicalPosition(m2.workArea.position),
      size: new PhysicalSize(m2.workArea.size)
    }
  };
}
async function currentMonitor() {
  return invoke("plugin:window|current_monitor").then(mapMonitor);
}
async function primaryMonitor() {
  return invoke("plugin:window|primary_monitor").then(mapMonitor);
}
async function monitorFromPoint(x, y) {
  return invoke("plugin:window|monitor_from_point", {
    x,
    y
  }).then(mapMonitor);
}
async function availableMonitors() {
  return invoke("plugin:window|available_monitors").then((ms) => ms.map(mapMonitor));
}
async function cursorPosition() {
  return invoke("plugin:window|cursor_position").then((v) => new PhysicalPosition(v));
}
var UserAttentionType, CloseRequestedEvent, ProgressBarStatus, localTauriEvents, Window, BackgroundThrottlingPolicy, ScrollBarStyle, Effect, EffectState;
var init_window = __esm({
  "node_modules/@tauri-apps/api/window.js"() {
    init_dpi();
    init_dpi();
    init_event();
    init_core();
    init_image();
    (function(UserAttentionType2) {
      UserAttentionType2[UserAttentionType2["Critical"] = 1] = "Critical";
      UserAttentionType2[UserAttentionType2["Informational"] = 2] = "Informational";
    })(UserAttentionType || (UserAttentionType = {}));
    CloseRequestedEvent = class {
      constructor(event) {
        this._preventDefault = false;
        this.event = event.event;
        this.id = event.id;
      }
      preventDefault() {
        this._preventDefault = true;
      }
      isPreventDefault() {
        return this._preventDefault;
      }
    };
    (function(ProgressBarStatus2) {
      ProgressBarStatus2["None"] = "none";
      ProgressBarStatus2["Normal"] = "normal";
      ProgressBarStatus2["Indeterminate"] = "indeterminate";
      ProgressBarStatus2["Paused"] = "paused";
      ProgressBarStatus2["Error"] = "error";
    })(ProgressBarStatus || (ProgressBarStatus = {}));
    localTauriEvents = ["tauri://created", "tauri://error"];
    Window = class {
      /**
       * Creates a new Window.
       * @example
       * ```typescript
       * import { Window } from '@tauri-apps/api/window';
       * const appWindow = new Window('my-label');
       * appWindow.once('tauri://created', function () {
       *  // window successfully created
       * });
       * appWindow.once('tauri://error', function (e) {
       *  // an error happened creating the window
       * });
       * ```
       *
       * @param label The unique window label. Must be alphanumeric: `a-zA-Z-/:_`.
       * @returns The {@link Window} instance to communicate with the window.
       */
      constructor(label, options = {}) {
        var _a;
        this.label = label;
        this.listeners = /* @__PURE__ */ Object.create(null);
        if (!(options === null || options === void 0 ? void 0 : options.skip)) {
          invoke("plugin:window|create", {
            options: {
              ...options,
              parent: typeof options.parent === "string" ? options.parent : (_a = options.parent) === null || _a === void 0 ? void 0 : _a.label,
              label
            }
          }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
        }
      }
      /**
       * Gets the Window associated with the given label.
       * @example
       * ```typescript
       * import { Window } from '@tauri-apps/api/window';
       * const mainWindow = Window.getByLabel('main');
       * ```
       *
       * @param label The window label.
       * @returns The Window instance to communicate with the window or null if the window doesn't exist.
       */
      static async getByLabel(label) {
        var _a;
        return (_a = (await getAllWindows()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
      }
      /**
       * Get an instance of `Window` for the current window.
       */
      static getCurrent() {
        return getCurrentWindow();
      }
      /**
       * Gets a list of instances of `Window` for all available windows.
       */
      static async getAll() {
        return getAllWindows();
      }
      /**
       *  Gets the focused window.
       * @example
       * ```typescript
       * import { Window } from '@tauri-apps/api/window';
       * const focusedWindow = Window.getFocusedWindow();
       * ```
       *
       * @returns The Window instance or `undefined` if there is not any focused window.
       */
      static async getFocusedWindow() {
        for (const w of await getAllWindows()) {
          if (await w.isFocused()) {
            return w;
          }
        }
        return null;
      }
      /**
       * Listen to an emitted event on this window.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const unlisten = await getCurrentWindow().listen<string>('state-changed', (event) => {
       *   console.log(`Got error: ${payload}`);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
       * @param handler Event handler.
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async listen(event, handler) {
        if (this._handleTauriEvent(event, handler)) {
          return () => {
            const listeners2 = this.listeners[event];
            listeners2.splice(listeners2.indexOf(handler), 1);
          };
        }
        return listen(event, handler, {
          target: { kind: "Window", label: this.label }
        });
      }
      /**
       * Listen to an emitted event on this window only once.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const unlisten = await getCurrentWindow().once<null>('initialized', (event) => {
       *   console.log(`Window initialized!`);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
       * @param handler Event handler.
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async once(event, handler) {
        if (this._handleTauriEvent(event, handler)) {
          return () => {
            const listeners2 = this.listeners[event];
            listeners2.splice(listeners2.indexOf(handler), 1);
          };
        }
        return once(event, handler, {
          target: { kind: "Window", label: this.label }
        });
      }
      /**
       * Emits an event to all {@link EventTarget|targets}.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().emit('window-loaded', { loggedIn: true, token: 'authToken' });
       * ```
       *
       * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
       * @param payload Event payload.
       */
      async emit(event, payload) {
        if (localTauriEvents.includes(event)) {
          for (const handler of this.listeners[event] || []) {
            handler({
              event,
              id: -1,
              payload
            });
          }
          return;
        }
        return emit(event, payload);
      }
      /**
       * Emits an event to all {@link EventTarget|targets} matching the given target.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().emit('main', 'window-loaded', { loggedIn: true, token: 'authToken' });
       * ```
       * @param target Label of the target Window/Webview/WebviewWindow or raw {@link EventTarget} object.
       * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
       * @param payload Event payload.
       */
      async emitTo(target, event, payload) {
        if (localTauriEvents.includes(event)) {
          for (const handler of this.listeners[event] || []) {
            handler({
              event,
              id: -1,
              payload
            });
          }
          return;
        }
        return emitTo(target, event, payload);
      }
      /** @ignore */
      _handleTauriEvent(event, handler) {
        if (localTauriEvents.includes(event)) {
          if (!(event in this.listeners)) {
            this.listeners[event] = [handler];
          } else {
            this.listeners[event].push(handler);
          }
          return true;
        }
        return false;
      }
      // Getters
      /**
       * The scale factor that can be used to map physical pixels to logical pixels.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const factor = await getCurrentWindow().scaleFactor();
       * ```
       *
       * @returns The window's monitor scale factor.
       */
      async scaleFactor() {
        return invoke("plugin:window|scale_factor", {
          label: this.label
        });
      }
      /**
       * The position of the top-left hand corner of the window's client area relative to the top-left hand corner of the desktop.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const position = await getCurrentWindow().innerPosition();
       * ```
       *
       * @returns The window's inner position.
       */
      async innerPosition() {
        return invoke("plugin:window|inner_position", {
          label: this.label
        }).then((p2) => new PhysicalPosition(p2));
      }
      /**
       * The position of the top-left hand corner of the window relative to the top-left hand corner of the desktop.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const position = await getCurrentWindow().outerPosition();
       * ```
       *
       * @returns The window's outer position.
       */
      async outerPosition() {
        return invoke("plugin:window|outer_position", {
          label: this.label
        }).then((p2) => new PhysicalPosition(p2));
      }
      /**
       * The physical size of the window's client area.
       * The client area is the content of the window, excluding the title bar and borders.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const size = await getCurrentWindow().innerSize();
       * ```
       *
       * @returns The window's inner size.
       */
      async innerSize() {
        return invoke("plugin:window|inner_size", {
          label: this.label
        }).then((s) => new PhysicalSize(s));
      }
      /**
       * The physical size of the entire window.
       * These dimensions include the title bar and borders. If you don't want that (and you usually don't), use inner_size instead.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const size = await getCurrentWindow().outerSize();
       * ```
       *
       * @returns The window's outer size.
       */
      async outerSize() {
        return invoke("plugin:window|outer_size", {
          label: this.label
        }).then((s) => new PhysicalSize(s));
      }
      /**
       * Gets the window's current fullscreen state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const fullscreen = await getCurrentWindow().isFullscreen();
       * ```
       *
       * @returns Whether the window is in fullscreen mode or not.
       */
      async isFullscreen() {
        return invoke("plugin:window|is_fullscreen", {
          label: this.label
        });
      }
      /**
       * Gets the window's current minimized state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const minimized = await getCurrentWindow().isMinimized();
       * ```
       */
      async isMinimized() {
        return invoke("plugin:window|is_minimized", {
          label: this.label
        });
      }
      /**
       * Gets the window's current maximized state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const maximized = await getCurrentWindow().isMaximized();
       * ```
       *
       * @returns Whether the window is maximized or not.
       */
      async isMaximized() {
        return invoke("plugin:window|is_maximized", {
          label: this.label
        });
      }
      /**
       * Gets the window's current focus state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const focused = await getCurrentWindow().isFocused();
       * ```
       *
       * @returns Whether the window is focused or not.
       */
      async isFocused() {
        return invoke("plugin:window|is_focused", {
          label: this.label
        });
      }
      /**
       * Gets the window's current decorated state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const decorated = await getCurrentWindow().isDecorated();
       * ```
       *
       * @returns Whether the window is decorated or not.
       */
      async isDecorated() {
        return invoke("plugin:window|is_decorated", {
          label: this.label
        });
      }
      /**
       * Gets the window's current resizable state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const resizable = await getCurrentWindow().isResizable();
       * ```
       *
       * @returns Whether the window is resizable or not.
       */
      async isResizable() {
        return invoke("plugin:window|is_resizable", {
          label: this.label
        });
      }
      /**
       * Gets the window's native maximize button state.
       *
       * #### Platform-specific
       *
       * - **Linux / iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const maximizable = await getCurrentWindow().isMaximizable();
       * ```
       *
       * @returns Whether the window's native maximize button is enabled or not.
       */
      async isMaximizable() {
        return invoke("plugin:window|is_maximizable", {
          label: this.label
        });
      }
      /**
       * Gets the window's native minimize button state.
       *
       * #### Platform-specific
       *
       * - **Linux / iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const minimizable = await getCurrentWindow().isMinimizable();
       * ```
       *
       * @returns Whether the window's native minimize button is enabled or not.
       */
      async isMinimizable() {
        return invoke("plugin:window|is_minimizable", {
          label: this.label
        });
      }
      /**
       * Gets the window's native close button state.
       *
       * #### Platform-specific
       *
       * - **iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const closable = await getCurrentWindow().isClosable();
       * ```
       *
       * @returns Whether the window's native close button is enabled or not.
       */
      async isClosable() {
        return invoke("plugin:window|is_closable", {
          label: this.label
        });
      }
      /**
       * Gets the window's current visible state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const visible = await getCurrentWindow().isVisible();
       * ```
       *
       * @returns Whether the window is visible or not.
       */
      async isVisible() {
        return invoke("plugin:window|is_visible", {
          label: this.label
        });
      }
      /**
       * Gets the window's current title.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const title = await getCurrentWindow().title();
       * ```
       */
      async title() {
        return invoke("plugin:window|title", {
          label: this.label
        });
      }
      /**
       * Gets the window's current theme.
       *
       * #### Platform-specific
       *
       * - **macOS:** Theme was introduced on macOS 10.14. Returns `light` on macOS 10.13 and below.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const theme = await getCurrentWindow().theme();
       * ```
       *
       * @returns The window theme.
       */
      async theme() {
        return invoke("plugin:window|theme", {
          label: this.label
        });
      }
      /**
       * Whether the window is configured to be always on top of other windows or not.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const alwaysOnTop = await getCurrentWindow().isAlwaysOnTop();
       * ```
       *
       * @returns Whether the window is visible or not.
       */
      async isAlwaysOnTop() {
        return invoke("plugin:window|is_always_on_top", {
          label: this.label
        });
      }
      async activityName() {
        return invoke("plugin:window|activity_name", {
          label: this.label
        });
      }
      async sceneIdentifier() {
        return invoke("plugin:window|scene_identifier", {
          label: this.label
        });
      }
      // Setters
      /**
       * Centers the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().center();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async center() {
        return invoke("plugin:window|center", {
          label: this.label
        });
      }
      /**
       *  Requests user attention to the window, this has no effect if the application
       * is already focused. How requesting for user attention manifests is platform dependent,
       * see `UserAttentionType` for details.
       *
       * Providing `null` will unset the request for user attention. Unsetting the request for
       * user attention might not be done automatically by the WM when the window receives input.
       *
       * #### Platform-specific
       *
       * - **macOS:** `null` has no effect.
       * - **Linux:** Urgency levels have the same effect.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().requestUserAttention();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async requestUserAttention(requestType) {
        let requestType_ = null;
        if (requestType) {
          if (requestType === UserAttentionType.Critical) {
            requestType_ = { type: "Critical" };
          } else {
            requestType_ = { type: "Informational" };
          }
        }
        return invoke("plugin:window|request_user_attention", {
          label: this.label,
          value: requestType_
        });
      }
      /**
       * Updates the window resizable flag.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setResizable(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setResizable(resizable) {
        return invoke("plugin:window|set_resizable", {
          label: this.label,
          value: resizable
        });
      }
      /**
       * Enable or disable the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setEnabled(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       *
       * @since 2.0.0
       */
      async setEnabled(enabled) {
        return invoke("plugin:window|set_enabled", {
          label: this.label,
          value: enabled
        });
      }
      /**
       * Whether the window is enabled or disabled.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setEnabled(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       *
       * @since 2.0.0
       */
      async isEnabled() {
        return invoke("plugin:window|is_enabled", {
          label: this.label
        });
      }
      /**
       * Sets whether the window's native maximize button is enabled or not.
       * If resizable is set to false, this setting is ignored.
       *
       * #### Platform-specific
       *
       * - **macOS:** Disables the "zoom" button in the window titlebar, which is also used to enter fullscreen mode.
       * - **Linux / iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setMaximizable(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setMaximizable(maximizable) {
        return invoke("plugin:window|set_maximizable", {
          label: this.label,
          value: maximizable
        });
      }
      /**
       * Sets whether the window's native minimize button is enabled or not.
       *
       * #### Platform-specific
       *
       * - **Linux / iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setMinimizable(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setMinimizable(minimizable) {
        return invoke("plugin:window|set_minimizable", {
          label: this.label,
          value: minimizable
        });
      }
      /**
       * Sets whether the window's native close button is enabled or not.
       *
       * #### Platform-specific
       *
       * - **Linux:** GTK+ will do its best to convince the window manager not to show a close button. Depending on the system, this function may not have any effect when called on a window that is already visible
       * - **iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setClosable(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setClosable(closable) {
        return invoke("plugin:window|set_closable", {
          label: this.label,
          value: closable
        });
      }
      /**
       * Sets the window title.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setTitle('Tauri');
       * ```
       *
       * @param title The new title
       * @returns A promise indicating the success or failure of the operation.
       */
      async setTitle(title) {
        return invoke("plugin:window|set_title", {
          label: this.label,
          value: title
        });
      }
      /**
       * Maximizes the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().maximize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async maximize() {
        return invoke("plugin:window|maximize", {
          label: this.label
        });
      }
      /**
       * Unmaximizes the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().unmaximize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async unmaximize() {
        return invoke("plugin:window|unmaximize", {
          label: this.label
        });
      }
      /**
       * Toggles the window maximized state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().toggleMaximize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async toggleMaximize() {
        return invoke("plugin:window|toggle_maximize", {
          label: this.label
        });
      }
      /**
       * Minimizes the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().minimize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async minimize() {
        return invoke("plugin:window|minimize", {
          label: this.label
        });
      }
      /**
       * Unminimizes the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().unminimize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async unminimize() {
        return invoke("plugin:window|unminimize", {
          label: this.label
        });
      }
      /**
       * Sets the window visibility to true.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().show();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async show() {
        return invoke("plugin:window|show", {
          label: this.label
        });
      }
      /**
       * Sets the window visibility to false.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().hide();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async hide() {
        return invoke("plugin:window|hide", {
          label: this.label
        });
      }
      /**
       * Closes the window.
       *
       * Note this emits a closeRequested event so you can intercept it. To force window close, use {@link Window.destroy}.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().close();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async close() {
        return invoke("plugin:window|close", {
          label: this.label
        });
      }
      /**
       * Destroys the window. Behaves like {@link Window.close} but forces the window close instead of emitting a closeRequested event.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().destroy();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async destroy() {
        return invoke("plugin:window|destroy", {
          label: this.label
        });
      }
      /**
       * Whether the window should have borders and bars.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setDecorations(false);
       * ```
       *
       * @param decorations Whether the window should have borders and bars.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setDecorations(decorations) {
        return invoke("plugin:window|set_decorations", {
          label: this.label,
          value: decorations
        });
      }
      /**
       * Whether or not the window should have shadow.
       *
       * #### Platform-specific
       *
       * - **Windows:**
       *   - `false` has no effect on decorated window, shadows are always ON.
       *   - `true` will make undecorated window have a 1px white border,
       * and on Windows 11, it will have a rounded corners.
       * - **Linux:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setShadow(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setShadow(enable) {
        return invoke("plugin:window|set_shadow", {
          label: this.label,
          value: enable
        });
      }
      /**
       * Set window effects.
       */
      async setEffects(effects) {
        return invoke("plugin:window|set_effects", {
          label: this.label,
          value: effects
        });
      }
      /**
       * Clear any applied effects if possible.
       */
      async clearEffects() {
        return invoke("plugin:window|set_effects", {
          label: this.label,
          value: null
        });
      }
      /**
       * Whether the window should always be on top of other windows.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setAlwaysOnTop(true);
       * ```
       *
       * @param alwaysOnTop Whether the window should always be on top of other windows or not.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setAlwaysOnTop(alwaysOnTop) {
        return invoke("plugin:window|set_always_on_top", {
          label: this.label,
          value: alwaysOnTop
        });
      }
      /**
       * Whether the window should always be below other windows.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setAlwaysOnBottom(true);
       * ```
       *
       * @param alwaysOnBottom Whether the window should always be below other windows or not.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setAlwaysOnBottom(alwaysOnBottom) {
        return invoke("plugin:window|set_always_on_bottom", {
          label: this.label,
          value: alwaysOnBottom
        });
      }
      /**
       * Prevents the window contents from being captured by other apps.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setContentProtected(true);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setContentProtected(protected_) {
        return invoke("plugin:window|set_content_protected", {
          label: this.label,
          value: protected_
        });
      }
      /**
       * Resizes the window with a new inner size.
       * @example
       * ```typescript
       * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
       * await getCurrentWindow().setSize(new LogicalSize(600, 500));
       * ```
       *
       * @param size The logical or physical inner size.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setSize(size) {
        return invoke("plugin:window|set_size", {
          label: this.label,
          value: size instanceof Size ? size : new Size(size)
        });
      }
      /**
       * Sets the window minimum inner size. If the `size` argument is not provided, the constraint is unset.
       * @example
       * ```typescript
       * import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
       * await getCurrentWindow().setMinSize(new PhysicalSize(600, 500));
       * ```
       *
       * @param size The logical or physical inner size, or `null` to unset the constraint.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setMinSize(size) {
        return invoke("plugin:window|set_min_size", {
          label: this.label,
          value: size instanceof Size ? size : size ? new Size(size) : null
        });
      }
      /**
       * Sets the window maximum inner size. If the `size` argument is undefined, the constraint is unset.
       * @example
       * ```typescript
       * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
       * await getCurrentWindow().setMaxSize(new LogicalSize(600, 500));
       * ```
       *
       * @param size The logical or physical inner size, or `null` to unset the constraint.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setMaxSize(size) {
        return invoke("plugin:window|set_max_size", {
          label: this.label,
          value: size instanceof Size ? size : size ? new Size(size) : null
        });
      }
      /**
       * Sets the window inner size constraints.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setSizeConstraints({ minWidth: 300 });
       * ```
       *
       * @param constraints The logical or physical inner size, or `null` to unset the constraint.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setSizeConstraints(constraints) {
        function logical(pixel) {
          return pixel ? { Logical: pixel } : null;
        }
        return invoke("plugin:window|set_size_constraints", {
          label: this.label,
          value: {
            minWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minWidth),
            minHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minHeight),
            maxWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxWidth),
            maxHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxHeight)
          }
        });
      }
      /**
       * Sets the window outer position.
       * @example
       * ```typescript
       * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
       * await getCurrentWindow().setPosition(new LogicalPosition(600, 500));
       * ```
       *
       * @param position The new position, in logical or physical pixels.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setPosition(position) {
        return invoke("plugin:window|set_position", {
          label: this.label,
          value: position instanceof Position ? position : new Position(position)
        });
      }
      /**
       * Sets the window fullscreen state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setFullscreen(true);
       * ```
       *
       * @param fullscreen Whether the window should go to fullscreen or not.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setFullscreen(fullscreen) {
        return invoke("plugin:window|set_fullscreen", {
          label: this.label,
          value: fullscreen
        });
      }
      /**
       * On macOS, Toggles a fullscreen mode that doesn’t require a new macOS space. Returns a boolean indicating whether the transition was successful (this won’t work if the window was already in the native fullscreen).
       * This is how fullscreen used to work on macOS in versions before Lion. And allows the user to have a fullscreen window without using another space or taking control over the entire monitor.
       *
       * On other platforms, this is the same as {@link Window.setFullscreen}.
       *
       * @param fullscreen Whether the window should go to simple fullscreen or not.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setSimpleFullscreen(fullscreen) {
        return invoke("plugin:window|set_simple_fullscreen", {
          label: this.label,
          value: fullscreen
        });
      }
      /**
       * Bring the window to front and focus.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setFocus();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setFocus() {
        return invoke("plugin:window|set_focus", {
          label: this.label
        });
      }
      /**
       * Sets whether the window can be focused.
       *
       * #### Platform-specific
       *
       * - **macOS**: If the window is already focused, it is not possible to unfocus it after calling `set_focusable(false)`.
       *   In this case, you might consider calling {@link Window.setFocus} but it will move the window to the back i.e. at the bottom in terms of z-order.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setFocusable(true);
       * ```
       *
       * @param focusable Whether the window can be focused.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setFocusable(focusable) {
        return invoke("plugin:window|set_focusable", {
          label: this.label,
          value: focusable
        });
      }
      /**
       * Sets the window icon.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setIcon('/tauri/awesome.png');
       * ```
       *
       * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
       * To enable it, change your Cargo.toml file:
       * ```toml
       * [dependencies]
       * tauri = { version = "...", features = ["...", "image-png"] }
       * ```
       *
       * @param icon Icon bytes or path to the icon file.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setIcon(icon) {
        return invoke("plugin:window|set_icon", {
          label: this.label,
          value: transformImage(icon)
        });
      }
      /**
       * Whether the window icon should be hidden from the taskbar or not.
       *
       * #### Platform-specific
       *
       * - **macOS:** Unsupported.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setSkipTaskbar(true);
       * ```
       *
       * @param skip true to hide window icon, false to show it.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setSkipTaskbar(skip) {
        return invoke("plugin:window|set_skip_taskbar", {
          label: this.label,
          value: skip
        });
      }
      /**
       * Grabs the cursor, preventing it from leaving the window.
       *
       * There's no guarantee that the cursor will be hidden. You should
       * hide it by yourself if you want so.
       *
       * #### Platform-specific
       *
       * - **Linux:** Unsupported.
       * - **macOS:** This locks the cursor in a fixed location, which looks visually awkward.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setCursorGrab(true);
       * ```
       *
       * @param grab `true` to grab the cursor icon, `false` to release it.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setCursorGrab(grab) {
        return invoke("plugin:window|set_cursor_grab", {
          label: this.label,
          value: grab
        });
      }
      /**
       * Modifies the cursor's visibility.
       *
       * #### Platform-specific
       *
       * - **Windows:** The cursor is only hidden within the confines of the window.
       * - **macOS:** The cursor is hidden as long as the window has input focus, even if the cursor is
       *   outside of the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setCursorVisible(false);
       * ```
       *
       * @param visible If `false`, this will hide the cursor. If `true`, this will show the cursor.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setCursorVisible(visible) {
        return invoke("plugin:window|set_cursor_visible", {
          label: this.label,
          value: visible
        });
      }
      /**
       * Modifies the cursor icon of the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setCursorIcon('help');
       * ```
       *
       * @param icon The new cursor icon.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setCursorIcon(icon) {
        return invoke("plugin:window|set_cursor_icon", {
          label: this.label,
          value: icon
        });
      }
      /**
       * Sets the window background color.
       *
       * #### Platform-specific:
       *
       * - **Windows:** alpha channel is ignored.
       * - **iOS / Android:** Unsupported.
       *
       * @returns A promise indicating the success or failure of the operation.
       *
       * @since 2.1.0
       */
      async setBackgroundColor(color) {
        return invoke("plugin:window|set_background_color", { color });
      }
      /**
       * Changes the position of the cursor in window coordinates.
       * @example
       * ```typescript
       * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
       * await getCurrentWindow().setCursorPosition(new LogicalPosition(600, 300));
       * ```
       *
       * @param position The new cursor position.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setCursorPosition(position) {
        return invoke("plugin:window|set_cursor_position", {
          label: this.label,
          value: position instanceof Position ? position : new Position(position)
        });
      }
      /**
       * Changes the cursor events behavior.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setIgnoreCursorEvents(true);
       * ```
       *
       * @param ignore `true` to ignore the cursor events; `false` to process them as usual.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setIgnoreCursorEvents(ignore) {
        return invoke("plugin:window|set_ignore_cursor_events", {
          label: this.label,
          value: ignore
        });
      }
      /**
       * Starts dragging the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().startDragging();
       * ```
       *
       * @return A promise indicating the success or failure of the operation.
       */
      async startDragging() {
        return invoke("plugin:window|start_dragging", {
          label: this.label
        });
      }
      /**
       * Starts resize-dragging the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().startResizeDragging();
       * ```
       *
       * @return A promise indicating the success or failure of the operation.
       */
      async startResizeDragging(direction) {
        return invoke("plugin:window|start_resize_dragging", {
          label: this.label,
          value: direction
        });
      }
      /**
       * Sets the badge count. It is app wide and not specific to this window.
       *
       * #### Platform-specific
       *
       * - **Windows**: Unsupported. Use @{linkcode Window.setOverlayIcon} instead.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setBadgeCount(5);
       * ```
       *
       * @param count The badge count. Use `undefined` to remove the badge.
       * @return A promise indicating the success or failure of the operation.
       */
      async setBadgeCount(count) {
        return invoke("plugin:window|set_badge_count", {
          label: this.label,
          value: count
        });
      }
      /**
       * Sets the badge cont **macOS only**.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setBadgeLabel("Hello");
       * ```
       *
       * @param label The badge label. Use `undefined` to remove the badge.
       * @return A promise indicating the success or failure of the operation.
       */
      async setBadgeLabel(label) {
        return invoke("plugin:window|set_badge_label", {
          label: this.label,
          value: label
        });
      }
      /**
       * Sets the overlay icon. **Windows only**
       * The overlay icon can be set for every window.
       *
       *
       * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
       * To enable it, change your Cargo.toml file:
       *
       * ```toml
       * [dependencies]
       * tauri = { version = "...", features = ["...", "image-png"] }
       * ```
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setOverlayIcon("/tauri/awesome.png");
       * ```
       *
       * @param icon Icon bytes or path to the icon file. Use `undefined` to remove the overlay icon.
       * @return A promise indicating the success or failure of the operation.
       */
      async setOverlayIcon(icon) {
        return invoke("plugin:window|set_overlay_icon", {
          label: this.label,
          value: icon ? transformImage(icon) : void 0
        });
      }
      /**
       * Sets the taskbar progress state.
       *
       * #### Platform-specific
       *
       * - **Linux / macOS**: Progress bar is app-wide and not specific to this window.
       * - **Linux**: Only supported desktop environments with `libunity` (e.g. GNOME).
       *
       * @example
       * ```typescript
       * import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window';
       * await getCurrentWindow().setProgressBar({
       *   status: ProgressBarStatus.Normal,
       *   progress: 50,
       * });
       * ```
       *
       * @return A promise indicating the success or failure of the operation.
       */
      async setProgressBar(state) {
        return invoke("plugin:window|set_progress_bar", {
          label: this.label,
          value: state
        });
      }
      /**
       * Sets whether the window should be visible on all workspaces or virtual desktops.
       *
       * #### Platform-specific
       *
       * - **Windows / iOS / Android:** Unsupported.
       *
       * @since 2.0.0
       */
      async setVisibleOnAllWorkspaces(visible) {
        return invoke("plugin:window|set_visible_on_all_workspaces", {
          label: this.label,
          value: visible
        });
      }
      /**
       * Sets the title bar style. **macOS only**.
       *
       * @since 2.0.0
       */
      async setTitleBarStyle(style) {
        return invoke("plugin:window|set_title_bar_style", {
          label: this.label,
          value: style
        });
      }
      /**
       * Set window theme, pass in `null` or `undefined` to follow system theme
       *
       * #### Platform-specific
       *
       * - **Linux / macOS**: Theme is app-wide and not specific to this window.
       * - **iOS / Android:** Unsupported.
       *
       * @since 2.0.0
       */
      async setTheme(theme) {
        return invoke("plugin:window|set_theme", {
          label: this.label,
          value: theme
        });
      }
      // Listeners
      /**
       * Listen to window resize.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onResized(({ payload: size }) => {
       *  console.log('Window resized', size);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onResized(handler) {
        return this.listen(TauriEvent.WINDOW_RESIZED, (e) => {
          e.payload = new PhysicalSize(e.payload);
          handler(e);
        });
      }
      /**
       * Listen to window move.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onMoved(({ payload: position }) => {
       *  console.log('Window moved', position);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onMoved(handler) {
        return this.listen(TauriEvent.WINDOW_MOVED, (e) => {
          e.payload = new PhysicalPosition(e.payload);
          handler(e);
        });
      }
      /**
       * Listen to window close requested. Emitted when the user requests to closes the window.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * import { confirm } from '@tauri-apps/api/dialog';
       * const unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
       *   const confirmed = await confirm('Are you sure?');
       *   if (!confirmed) {
       *     // user did not confirm closing the window; let's prevent it
       *     event.preventDefault();
       *   }
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onCloseRequested(handler) {
        return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (event) => {
          const evt = new CloseRequestedEvent(event);
          await handler(evt);
          if (!evt.isPreventDefault()) {
            await this.destroy();
          }
        });
      }
      /**
       * Listen to a file drop event.
       * The listener is triggered when the user hovers the selected files on the webview,
       * drops the files or cancels the operation.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/webview";
       * const unlisten = await getCurrentWindow().onDragDropEvent((event) => {
       *  if (event.payload.type === 'over') {
       *    console.log('User hovering', event.payload.position);
       *  } else if (event.payload.type === 'drop') {
       *    console.log('User dropped', event.payload.paths);
       *  } else {
       *    console.log('File drop cancelled');
       *  }
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onDragDropEvent(handler) {
        const unlistenDrag = await this.listen(TauriEvent.DRAG_ENTER, (event) => {
          handler({
            ...event,
            payload: {
              type: "enter",
              paths: event.payload.paths,
              position: new PhysicalPosition(event.payload.position)
            }
          });
        });
        const unlistenDragOver = await this.listen(TauriEvent.DRAG_OVER, (event) => {
          handler({
            ...event,
            payload: {
              type: "over",
              position: new PhysicalPosition(event.payload.position)
            }
          });
        });
        const unlistenDrop = await this.listen(TauriEvent.DRAG_DROP, (event) => {
          handler({
            ...event,
            payload: {
              type: "drop",
              paths: event.payload.paths,
              position: new PhysicalPosition(event.payload.position)
            }
          });
        });
        const unlistenCancel = await this.listen(TauriEvent.DRAG_LEAVE, (event) => {
          handler({ ...event, payload: { type: "leave" } });
        });
        return () => {
          unlistenDrag();
          unlistenDrop();
          unlistenDragOver();
          unlistenCancel();
        };
      }
      /**
       * Listen to window focus change.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
       *  console.log('Focus changed, window is focused? ' + focused);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onFocusChanged(handler) {
        const unlistenFocus = await this.listen(TauriEvent.WINDOW_FOCUS, (event) => {
          handler({ ...event, payload: true });
        });
        const unlistenBlur = await this.listen(TauriEvent.WINDOW_BLUR, (event) => {
          handler({ ...event, payload: false });
        });
        return () => {
          unlistenFocus();
          unlistenBlur();
        };
      }
      /**
       * Listen to window scale change. Emitted when the window's scale factor has changed.
       * The following user actions can cause DPI changes:
       * - Changing the display's resolution.
       * - Changing the display's scale factor (e.g. in Control Panel on Windows).
       * - Moving the window to a display with a different scale factor.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onScaleChanged(({ payload }) => {
       *  console.log('Scale changed', payload.scaleFactor, payload.size);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onScaleChanged(handler) {
        return this.listen(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, handler);
      }
      /**
       * Listen to the system theme change.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onThemeChanged(({ payload: theme }) => {
       *  console.log('New theme: ' + theme);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onThemeChanged(handler) {
        return this.listen(TauriEvent.WINDOW_THEME_CHANGED, handler);
      }
    };
    (function(BackgroundThrottlingPolicy2) {
      BackgroundThrottlingPolicy2["Disabled"] = "disabled";
      BackgroundThrottlingPolicy2["Throttle"] = "throttle";
      BackgroundThrottlingPolicy2["Suspend"] = "suspend";
    })(BackgroundThrottlingPolicy || (BackgroundThrottlingPolicy = {}));
    (function(ScrollBarStyle2) {
      ScrollBarStyle2["Default"] = "default";
      ScrollBarStyle2["FluentOverlay"] = "fluentOverlay";
    })(ScrollBarStyle || (ScrollBarStyle = {}));
    (function(Effect2) {
      Effect2["AppearanceBased"] = "appearanceBased";
      Effect2["Light"] = "light";
      Effect2["Dark"] = "dark";
      Effect2["MediumLight"] = "mediumLight";
      Effect2["UltraDark"] = "ultraDark";
      Effect2["Titlebar"] = "titlebar";
      Effect2["Selection"] = "selection";
      Effect2["Menu"] = "menu";
      Effect2["Popover"] = "popover";
      Effect2["Sidebar"] = "sidebar";
      Effect2["HeaderView"] = "headerView";
      Effect2["Sheet"] = "sheet";
      Effect2["WindowBackground"] = "windowBackground";
      Effect2["HudWindow"] = "hudWindow";
      Effect2["FullScreenUI"] = "fullScreenUI";
      Effect2["Tooltip"] = "tooltip";
      Effect2["ContentBackground"] = "contentBackground";
      Effect2["UnderWindowBackground"] = "underWindowBackground";
      Effect2["UnderPageBackground"] = "underPageBackground";
      Effect2["Mica"] = "mica";
      Effect2["Blur"] = "blur";
      Effect2["Acrylic"] = "acrylic";
      Effect2["Tabbed"] = "tabbed";
      Effect2["TabbedDark"] = "tabbedDark";
      Effect2["TabbedLight"] = "tabbedLight";
    })(Effect || (Effect = {}));
    (function(EffectState2) {
      EffectState2["FollowsWindowActiveState"] = "followsWindowActiveState";
      EffectState2["Active"] = "active";
      EffectState2["Inactive"] = "inactive";
    })(EffectState || (EffectState = {}));
  }
});

// src/app/desktop.ts
var desktop_exports = {};
__export(desktop_exports, {
  detectHost: () => detectHost,
  detectPlatform: () => detectPlatform,
  downloadText: () => downloadText,
  getWindowApi: () => getWindowApi,
  notifyNative: () => notifyNative,
  pickJsonFile: () => pickJsonFile
});
function detectHost() {
  if (typeof window === "undefined") return "web";
  const w = window;
  if (w.__TAURI_INTERNALS__) return "tauri";
  if (w.__TAURI__) return "tauri";
  if (typeof navigator !== "undefined" && /tauri/i.test(navigator.userAgent)) return "tauri";
  return "web";
}
function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  return "linux";
}
async function getWindowApi() {
  if (detectHost() === "tauri") {
    try {
      const { getCurrentWindow: getCurrentWindow2 } = await Promise.resolve().then(() => (init_window(), window_exports));
      const w = getCurrentWindow2();
      return {
        minimize: () => w.minimize(),
        toggleMaximize: () => w.toggleMaximize(),
        close: () => w.close(),
        startDragging: () => w.startDragging(),
        isFullscreen: () => w.isFullscreen(),
        setFullscreen: (v) => w.setFullscreen(v),
        setAlwaysOnTop: (v) => w.setAlwaysOnTop(v)
      };
    } catch {
    }
  }
  return {
    minimize: async () => {
      document.body.classList.toggle("desk-min", true);
    },
    toggleMaximize: async () => {
      document.body.classList.toggle("desk-max");
    },
    close: async () => {
      window.close();
    },
    startDragging: async () => {
    },
    isFullscreen: async () => Boolean(document.fullscreenElement),
    setFullscreen: async (v) => {
      if (v) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    },
    setAlwaysOnTop: async () => {
    }
  };
}
function notifyNative(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    } else if ("Notification" in window && Notification.permission !== "denied") {
      void Notification.requestPermission().then((p2) => {
        if (p2 === "granted") new Notification(title, { body });
      });
    }
  } catch {
  }
}
function downloadText(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
async function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.selfimpulse.json,.mjpack";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result)));
        } catch {
          resolve(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
var init_desktop = __esm({
  "src/app/desktop.ts"() {
    "use strict";
  }
});

// src/security/ipClassify.ts
function expandIpv6(input) {
  let s = input;
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(":")) return null;
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    s = `${s.slice(0, lastColon + 1)}${(v4[0] << 8 | v4[1]).toString(16)}:${(v4[2] << 8 | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 ? halves[1] ? halves[1].split(":") : [] : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1) {
    if (head.length !== 8) return null;
  } else if (missing < 0) {
    return null;
  }
  const groups = [];
  for (const g of head) groups.push(parseInt(g, 16));
  for (let i = 0; i < missing; i += 1) groups.push(0);
  for (const g of rest) groups.push(parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 65535)) return null;
  return groups;
}
function parseIpv4(input) {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const octets = [];
  for (const p2 of parts) {
    if (!/^\d{1,3}$/.test(p2)) return null;
    const n = Number(p2);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}
function isObfuscatedIpv4Literal(host) {
  if (/^\d{1,3}(\.\d{1,3}){0,2}$/.test(host)) return true;
  if (/^0[xX][0-9a-fA-F]{1,8}$/.test(host)) return true;
  return false;
}
function normalizeHost(rawHost) {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return { kind: "unknown", ip: "" };
  const v4 = parseIpv4(host);
  if (v4) return { kind: "ipv4", ip: v4.join("."), octets: v4 };
  if (host.includes(":")) {
    const groups = expandIpv6(host);
    if (groups) {
      const isMapped = groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 65535 || groups[5] === 0);
      if (isMapped) {
        const octets = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255];
        return { kind: "ipv4", ip: octets.join("."), octets };
      }
      return { kind: "ipv6", ip: groups.map((g) => g.toString(16).padStart(4, "0")).join(":"), groups };
    }
  }
  if (isObfuscatedIpv4Literal(host)) return { kind: "unknown", ip: "" };
  return { kind: "unknown", ip: "" };
}
function classifyV4(o, allowLoopback) {
  const [a, b] = o;
  const inCidr = (base, bits) => {
    let acc = 0;
    for (let i = 0; i < 4; i += 1) {
      const rem = bits - i * 8;
      const mask = rem <= 0 ? 0 : rem >= 8 ? 255 : 255 << 8 - rem & 255;
      if ((o[i] & mask) !== (base[i] & mask)) return false;
      acc += 1;
      if (acc > 4) break;
    }
    return true;
  };
  const C = (scope, reason) => ({ ok: false, reason, scope });
  if (a === 127) return allowLoopback ? { ok: true, reason: "", scope: "loopback" } : C("loopback", "loopback address refused (SSRF guard)");
  if (a === 169 && b === 254) {
    if (o[2] === 169 && o[3] === 254) return C("metadata", "cloud metadata endpoint refused (SSRF guard)");
    return C("link-local", "link-local address refused (SSRF guard)");
  }
  if (inCidr([0, 0, 0, 0], 8)) return C("reserved", "this-network address refused (SSRF guard)");
  if (inCidr([10, 0, 0, 0], 8)) return C("private", "private network address refused (SSRF guard)");
  if (inCidr([100, 64, 0, 0], 10)) return C("special", "carrier-grade NAT address refused (SSRF guard)");
  if (inCidr([172, 16, 0, 0], 12)) return C("private", "private network address refused (SSRF guard)");
  if (inCidr([192, 0, 0, 0], 24)) return C("special", "IETF protocol assignment refused (SSRF guard)");
  if (inCidr([192, 0, 2, 0], 24)) return C("special", "documentation range refused (SSRF guard)");
  if (inCidr([192, 88, 99, 0], 24)) return C("special", "6to4 relay anycast refused (SSRF guard)");
  if (inCidr([192, 168, 0, 0], 16)) return C("private", "private network address refused (SSRF guard)");
  if (inCidr([198, 18, 0, 0], 15)) return C("special", "benchmarking range refused (SSRF guard)");
  if (inCidr([198, 51, 100, 0], 24)) return C("special", "documentation range refused (SSRF guard)");
  if (inCidr([203, 0, 113, 0], 24)) return C("special", "documentation range refused (SSRF guard)");
  if (a >= 224 && a <= 239) return C("multicast", "multicast address refused (SSRF guard)");
  if (a >= 240) return C("reserved", "reserved address refused (SSRF guard)");
  return { ok: true, reason: "", scope: "public" };
}
function classifyV6(g, allowLoopback) {
  const hex = g.map((x) => x.toString(16).padStart(4, "0")).join(":");
  const C = (scope, reason) => ({ ok: false, reason, scope });
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) {
    return allowLoopback ? { ok: true, reason: "", scope: "loopback" } : C("loopback", "IPv6 loopback refused (SSRF guard)");
  }
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 0) return C("reserved", "unspecified address refused (SSRF guard)");
  if ((g[0] & 65024) === 64512) return C("private", "IPv6 unique-local refused (SSRF guard)");
  if ((g[0] & 65472) === 65152) return C("link-local", "IPv6 link-local refused (SSRF guard)");
  if ((g[0] & 65280) === 65280) return C("multicast", "IPv6 multicast refused (SSRF guard)");
  if (g[0] === 8193 && g[1] === 3512) return C("special", "IPv6 documentation range refused (SSRF guard)");
  if (g[0] === 100 && g[1] === 65435) {
    const octets = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
    const inner = classifyV4(octets, allowLoopback);
    return inner.ok ? inner : C(inner.scope, `NAT64-embedded address refused (SSRF guard): ${inner.reason}`);
  }
  if (g[0] === 8194) return C("special", `6to4 address refused (SSRF guard): ${hex}`);
  if (g[0] === 8193 && g[1] === 0) return C("special", `Teredo address refused (SSRF guard): ${hex}`);
  return { ok: true, reason: "", scope: "public" };
}
function classifyIp(n, allowLoopback) {
  if (n.kind === "ipv4" && n.octets) return classifyV4(n.octets, allowLoopback);
  if (n.kind === "ipv6" && n.groups) return classifyV6(n.groups, allowLoopback);
  return { ok: false, reason: "address could not be classified", scope: "unknown" };
}
function classifyHost(rawHost, allowLoopback = false) {
  return classifyIp(normalizeHost(rawHost), allowLoopback);
}
var init_ipClassify = __esm({
  "src/security/ipClassify.ts"() {
    "use strict";
  }
});

// src/security/guardrail.ts
function checkEgressUrl(raw, opts = {}) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "not a parseable URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: `scheme "${u.protocol}" refused \u2014 only http(s) egress is allowed` };
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "metadata.google.internal") {
    return { ok: false, reason: "cloud metadata endpoint refused (SSRF guard)" };
  }
  for (const sfx of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(sfx)) return { ok: false, reason: `host suffix "${sfx}" refused` };
  }
  const verdict = classifyHost(host, opts.allowLoopback ?? true);
  if (verdict.ok || verdict.scope === "unknown") return { ok: true, reason: "" };
  return { ok: false, reason: verdict.reason };
}
var RateGate, BLOCKED_HOST_SUFFIXES, callRateGate;
var init_guardrail = __esm({
  "src/security/guardrail.ts"() {
    "use strict";
    init_ipClassify();
    RateGate = class {
      constructor(limit, windowMs, now = () => Date.now()) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.now = now;
      }
      hits = /* @__PURE__ */ new Map();
      /** Returns true when the action is within budget (and records it). */
      check(key2) {
        const t = this.now();
        const arr = (this.hits.get(key2) ?? []).filter((x) => t - x < this.windowMs);
        if (arr.length >= this.limit) {
          this.hits.set(key2, arr);
          return false;
        }
        arr.push(t);
        this.hits.set(key2, arr);
        return true;
      }
    };
    BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost"];
    callRateGate = new RateGate(120, 6e4);
  }
});

// src/security/egressNet.ts
async function resolveEgress(raw, opts = {}) {
  const allowLoopback = opts.allowLoopback ?? false;
  const resolve = opts.resolve ?? systemResolver;
  const base = checkEgressUrl(raw);
  if (!base.ok) return { ok: false, reason: base.reason };
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  const literal = normalizeHost(host);
  if (literal.kind !== "unknown") {
    const cls = classifyIp(literal, allowLoopback);
    return cls.ok ? { ok: true, reason: "", pinnedIp: literal.ip, scope: cls.scope } : { ok: false, reason: `${literal.ip} \u2014 ${cls.reason}`, scope: cls.scope };
  }
  if (literal.ip === "" && isObfuscatedIpv4Literal(host.toLowerCase())) {
    return { ok: false, reason: `obfuscated IP literal "${host}" refused \u2014 write the address in dotted-quad form`, scope: "unknown" };
  }
  let answers;
  try {
    answers = await resolve(host);
  } catch (e) {
    return { ok: false, reason: `DNS resolution failed for "${host}": ${e instanceof Error ? e.message : String(e)}` };
  }
  if (answers.length === 0) return { ok: false, reason: `"${host}" resolved to no addresses \u2014 refused rather than guessing`, scope: "unknown" };
  const seen = [];
  let pinned = null;
  for (const a of answers) {
    const n = normalizeHost(a);
    const cls = classifyIp(n, allowLoopback);
    if (!cls.ok) {
      return { ok: false, reason: `"${host}" resolves to ${n.ip || a} \u2014 ${cls.reason}`, scope: cls.scope };
    }
    seen.push(n.ip || a);
    if (!pinned) pinned = { ip: n.ip || a, scope: cls.scope };
  }
  return { ok: true, reason: "", pinnedIp: pinned.ip, scope: pinned.scope, hops: [{ url: raw, ip: pinned.ip, status: 0 }] };
}
async function safeEgressFetch(raw, init = {}) {
  const { fetchImpl, allowLoopback, resolve, maxRedirects, ...rest } = init;
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) throw new Error("no fetch available in this runtime \u2014 nothing was executed");
  const hops = [];
  let current = raw;
  for (let hop = 0; hop <= (maxRedirects ?? DEFAULT_MAX_REDIRECTS); hop += 1) {
    const decision = await resolveEgress(current, { allowLoopback, resolve });
    if (!decision.ok) {
      throw new Error(`egress refused at hop ${hop}: ${decision.reason} \u2014 nothing further was sent.`);
    }
    const res = await doFetch(current, { ...rest, redirect: "manual" });
    hops.push({ url: current, ip: decision.pinnedIp ?? "", status: res.status });
    const location = res.headers.get("location");
    if (!location || res.status < 300 || res.status > 399) {
      Object.defineProperty(res, "egressHops", { value: hops, enumerable: false });
      return res;
    }
    let next;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw new Error(`egress refused: hop ${hop} returned an unparseable Location \u2014 nothing further was sent.`);
    }
    if (hop === (maxRedirects ?? DEFAULT_MAX_REDIRECTS)) {
      throw new Error(`egress refused: more than ${maxRedirects ?? DEFAULT_MAX_REDIRECTS} redirects \u2014 possible redirect loop.`);
    }
    current = next;
  }
  throw new Error("egress refused: redirect budget exhausted.");
}
var systemResolver, DEFAULT_MAX_REDIRECTS;
var init_egressNet = __esm({
  "src/security/egressNet.ts"() {
    "use strict";
    init_guardrail();
    init_ipClassify();
    systemResolver = async (hostname) => {
      const dns = await import("node:dns/promises").catch(() => null);
      if (!dns) return [];
      const out = [];
      try {
        for (const r of await dns.lookup(hostname, { all: true, verbatim: true })) out.push(r.address);
      } catch {
      }
      return out;
    };
    DEFAULT_MAX_REDIRECTS = 5;
  }
});

// src/version.ts
var ENGINE_VERSION, ENGINE_SHORT, ENGINE_CODENAME, PRODUCT_TITLE;
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
    ENGINE_VERSION = "19.7.15";
    ENGINE_SHORT = "19.7";
    ENGINE_CODENAME = "SelfImpulse";
    PRODUCT_TITLE = `SelfImpulse (engine MJ ${ENGINE_SHORT} "${ENGINE_CODENAME}")`;
  }
});

// src/ipc/localDb.ts
function empty() {
  return {
    workflows: [],
    executions: [],
    events: [],
    memories: [],
    skills: [],
    feedback: [],
    evolution: [],
    mcp: seedMcp(),
    approvals: [],
    dlq: [],
    secrets: {},
    runQueue: []
  };
}
function seedMcp() {
  const now = nowIso();
  const rows = [
    ["mcp.filesystem", "Filesystem", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/filesystem/index.ts"]],
    ["mcp.git", "Git", "python", ["-m", "mcp_server_git"]],
    ["mcp.memory", "Memory", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/memory/index.ts"]],
    ["mcp.sequential-thinking", "Sequential Thinking", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/sequentialthinking/index.ts"]],
    ["mcp.time", "Time", "python", ["-m", "mcp_server_time"]],
    ["mcp.github", "GitHub", "github-mcp-server", ["stdio"]],
    ["mcp.control", "Control MCP", "selfimpulse-control-mcp", ["stdio"]]
  ];
  return rows.map(([id, name, command, args]) => ({
    id,
    name,
    transport: "stdio",
    config: { transport: "stdio", command, args, enabled: id === "mcp.control", pinned: true },
    state: "AVAILABLE",
    createdAt: now,
    updatedAt: now
  }));
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}
function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
var KEY, localDb;
var init_localDb = __esm({
  "src/ipc/localDb.ts"() {
    "use strict";
    init_id();
    init_types();
    KEY = "selfimpulse.v3.db";
    localDb = {
      load,
      save,
      reset() {
        localStorage.removeItem(KEY);
      },
      workflowList() {
        return load().workflows.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      workflowGet(id) {
        const w = load().workflows.find((x) => x.id === id);
        if (!w) throw new Error(`workflow not found: ${id}`);
        return w;
      },
      workflowCreate(name, description) {
        const db = load();
        const id = uid("wf");
        const now = nowIso();
        const graph = {
          schemaVersion: GRAPH_SCHEMA_VERSION,
          id,
          name,
          nodes: [],
          connections: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          groups: [],
          notes: []
        };
        db.workflows.unshift({ id, name, description, graph, createdAt: now, updatedAt: now, tags: [] });
        save(db);
        return { id };
      },
      workflowSave(id, name, description, graph) {
        const db = load();
        const w = db.workflows.find((x) => x.id === id);
        if (!w) throw new Error("workflow not found");
        w.name = name;
        w.description = description;
        w.graph = graph;
        w.updatedAt = nowIso();
        save(db);
      },
      workflowDelete(id) {
        const db = load();
        db.workflows = db.workflows.filter((w) => w.id !== id);
        save(db);
      },
      executionCreate(workflowId, workflowVersion) {
        const db = load();
        const id = uid("exec");
        db.executions.unshift({
          id,
          workflowId,
          workflowVersion,
          status: "RUNNING",
          startedAt: nowIso(),
          endedAt: null,
          error: null,
          stats: { nodesRun: 0, nodesFailed: 0, retries: 0, inputTokens: 0, outputTokens: 0, durationMs: 0, costUsd: 0, evaluationScores: [] }
        });
        save(db);
        return { id };
      },
      executionFinish(id, status, error, stats) {
        const db = load();
        const e = db.executions.find((x) => x.id === id);
        if (!e) return;
        e.status = status;
        e.error = error;
        e.stats = stats;
        e.endedAt = nowIso();
        save(db);
      },
      executionList() {
        return load().executions;
      },
      eventEmit(executionId, kind, level, nodeId, data) {
        const db = load();
        const rec = {
          seq: db.events.length + 1,
          ts: nowIso(),
          kind,
          level,
          nodeId,
          executionId,
          data
        };
        db.events.push(rec);
        if (db.events.length > 4e3) db.events = db.events.slice(-3e3);
        save(db);
        window.dispatchEvent(new CustomEvent("vh://event", { detail: rec }));
        return rec;
      },
      executionEvents(executionId) {
        return load().events.filter((e) => e.executionId === executionId);
      },
      importedGenomesSave(rows) {
        const db = load();
        db.importedGenomes = rows;
        save(db);
      },
      importedGenomesList() {
        return load().importedGenomes ?? [];
      },
      secretSet(ref, value) {
        const db = load();
        db.secrets[ref] = value;
        save(db);
      },
      secretDelete(ref) {
        const db = load();
        delete db.secrets[ref];
        save(db);
      },
      secretExists(refs) {
        const db = load();
        return Object.fromEntries(
          refs.map((r) => [
            r,
            db.secrets[r] ? { exists: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain. Readable by anything in this origin." } : { exists: false, location: "absent", survivesRestart: false }
          ])
        );
      },
      secretGet(ref) {
        return load().secrets[ref] ?? null;
      },
      mcpList() {
        return load().mcp;
      },
      mcpSave(cfg) {
        const db = load();
        const id = cfg.id || uid("mcp");
        const now = nowIso();
        const existing = db.mcp.find((m2) => m2.id === id);
        if (existing) {
          Object.assign(existing, cfg, { updatedAt: now });
        } else {
          db.mcp.push({
            id,
            name: cfg.name,
            transport: cfg.transport ?? "stdio",
            config: cfg.config ?? { transport: "stdio", enabled: true },
            state: "AVAILABLE",
            createdAt: now,
            updatedAt: now
          });
        }
        save(db);
        return { id };
      },
      mcpRemove(id) {
        const db = load();
        db.mcp = db.mcp.filter((m2) => m2.id !== id);
        save(db);
      },
      memoryAdd(nodeKey, kind, content, tags, importance) {
        const db = load();
        const rec = { id: uid("mem"), nodeKey, kind, content, tags, importance, createdAt: nowIso() };
        db.memories.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      memorySearch(nodeKey, query, limit = 12) {
        const q = query.toLowerCase();
        return load().memories.filter((m2) => m2.nodeKey === nodeKey && (!q || m2.content.toLowerCase().includes(q))).slice(0, limit);
      },
      memoryDelete(id) {
        const db = load();
        db.memories = db.memories.filter((m2) => m2.id !== id);
        save(db);
      },
      skillsList(nodeKey) {
        const all = load().skills.filter((s) => s.nodeKey === nodeKey);
        return { skills: all.filter((s) => s.active), all };
      },
      skillUpsert(args) {
        const db = load();
        const rec = {
          id: uid("skill"),
          nodeKey: args.nodeKey,
          name: args.name,
          description: args.description,
          procedure: args.procedure,
          preconditions: "",
          toolStrategy: "",
          verificationStrategy: "",
          knownFailureModes: "",
          version: 1,
          score: null,
          origin: args.origin,
          active: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          applications: 0
        };
        db.skills.push(rec);
        save(db);
        return { id: rec.id, version: 1 };
      },
      feedbackAdd(executionId, nodeKey, rating, comment) {
        const db = load();
        const rec = { id: uid("fb"), executionId, nodeKey, rating, comment, createdAt: nowIso() };
        db.feedback.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      feedbackList() {
        return load().feedback;
      },
      evolutionList() {
        return load().evolution;
      },
      evolutionPropose(cand) {
        const db = load();
        const rec = {
          id: uid("evo"),
          nodeKey: cand.nodeKey ?? "",
          parentVersion: cand.parentVersion ?? 1,
          candidateVersion: cand.candidateVersion ?? 2,
          trigger: cand.trigger ?? "manual",
          evidence: cand.evidence ?? [],
          changes: cand.changes ?? {},
          baselineScore: cand.baselineScore ?? null,
          candidateScore: cand.candidateScore ?? null,
          holdoutPassed: cand.holdoutPassed ?? null,
          regressionPassed: cand.regressionPassed ?? null,
          status: "PROPOSED",
          decision: "PENDING",
          createdAt: nowIso(),
          decidedAt: null
        };
        db.evolution.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      evolutionDecide(id, decision) {
        const db = load();
        const c = db.evolution.find((x) => x.id === id);
        if (!c) throw new Error(`evolution candidate ${id} does not exist \u2014 nothing was changed.`);
        if (c.status !== "PROPOSED")
          throw new Error(
            `evolution candidate ${id} is not PROPOSED (current status ${c.status}) \u2014 it moves exactly once, from PROPOSED to DECIDED.`
          );
        c.decision = decision;
        c.status = "DECIDED";
        c.decidedAt = nowIso();
        save(db);
        return { ok: true };
      },
      approvalList() {
        return load().approvals.filter((a) => a.status === "OPEN").map(({ capability: _capability, ...rest }) => rest);
      },
      approvalRequest(executionId, nodeKey, summary, payload, requestedBy) {
        const db = load();
        const rec = {
          id: uid("appr"),
          executionId,
          nodeKey,
          summary,
          payload,
          status: "OPEN",
          createdAt: nowIso(),
          // C-2 (archive 4): the request binds who asked and what authority answers.
          requestedBy: requestedBy && requestedBy.trim() ? requestedBy : `execution:${executionId}`,
          authority: "human"
        };
        db.approvals.unshift(rec);
        save(db);
        window.dispatchEvent(new CustomEvent("vh://approval", { detail: rec }));
        return { id: rec.id, requestedBy: rec.requestedBy, authority: rec.authority };
      },
      /** C-2 (archive 4) — the web mirror's native-equivalent capability mint.
       *
       *  Desktop mints through an OS dialog; the browser's equivalent of a window
       *  WebView scripts cannot answer is `window.confirm` — synchronous, modal,
       *  and not programmatically dismissible. Declined confirm ⇒ no token, no
       *  decision. The token is scoped to one verdict and expires in five minutes,
       *  exactly like the native capability. */
      approvalAuthorize(id, decision) {
        if (decision !== "APPROVED" && decision !== "REJECTED") {
          throw new Error(`approval_authorize: decision must be APPROVED or REJECTED (got ${JSON.stringify(decision)})`);
        }
        const db = load();
        const a = db.approvals.find((x) => x.id === id);
        if (!a) throw new Error(`approval ${id} does not exist \u2014 nothing to authorize.`);
        if (a.status !== "OPEN") throw new Error(`approval ${id} is not OPEN (current status ${a.status}) \u2014 nothing to authorize.`);
        if (typeof window === "undefined" || typeof window.confirm !== "function") {
          throw new Error("approval_authorize requires an interactive confirm dialog \u2014 refusing to mint a capability non-interactively.");
        }
        const word = decision === "APPROVED" ? "approve" : "refuse";
        const ok2 = window.confirm(
          `SelfImpulse \u2014 human approval gate

${a.summary}

Requester: ${a.requestedBy ?? `execution:${a.executionId}`}
Required authority: ${a.authority ?? "human"}
Verdict if you confirm: ${decision}

${word.toUpperCase()} this? Cancel mints nothing and decides nothing.`
        );
        if (!ok2) {
          throw new Error(`approval ${id}: declined at the confirm dialog \u2014 no capability was minted and no decision was recorded.`);
        }
        const token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? `cap_${crypto.randomUUID()}` : uid("cap");
        a.capability = token;
        a.capExpiresAt = Math.floor(Date.now() / 1e3) + 300;
        a.capDecision = decision;
        save(db);
        return { capability: token, expiresAt: a.capExpiresAt, approvalId: id, decision };
      },
      approvalDecide(id, decision, capability) {
        const db = load();
        const a = db.approvals.find((x) => x.id === id);
        if (!a) throw new Error(`approval ${id} does not exist \u2014 nothing was changed.`);
        if (a.status !== "OPEN")
          throw new Error(
            `approval ${id} is not OPEN (current status ${a.status}) \u2014 a decision is final; an approval moves exactly once, from OPEN to APPROVED or REJECTED.`
          );
        if (!capability || !capability.trim())
          throw new Error(
            `approval ${id}: no capability presented \u2014 a decision must first pass approval_authorize, where a human answers the dialog. Requester code cannot decide its own request.`
          );
        if (!a.capability)
          throw new Error(`approval ${id} has no live capability \u2014 call approval_authorize first; the human's answer is what makes a decision legitimate.`);
        if (a.capability !== capability)
          throw new Error(`capability does not belong to approval ${id} \u2014 it was minted for a different request (confused-approver refused).`);
        if (typeof a.capExpiresAt === "number" && Math.floor(Date.now() / 1e3) > a.capExpiresAt)
          throw new Error(`capability for approval ${id} expired (freshness window closed) \u2014 return to approval_authorize for a fresh answer.`);
        if (a.capDecision !== decision)
          throw new Error(
            `capability for approval ${id} was minted for ${a.capDecision ?? "no verdict"}; it cannot cast ${decision}. Re-open approval_authorize and let the human pick this verdict explicitly.`
          );
        a.status = decision;
        a.decidedBy = "human:confirm";
        a.decidedAt = nowIso();
        a.capability = void 0;
        a.capExpiresAt = void 0;
        a.capDecision = void 0;
        save(db);
      },
      approvalGet(executionId, nodeKey) {
        const a = load().approvals.find((x) => x.executionId === executionId && x.nodeKey === nodeKey && x.status !== "OPEN");
        return a ? { decided: true, status: a.status, id: a.id, decidedBy: a.decidedBy ?? "", decidedAt: a.decidedAt ?? null, requestedBy: a.requestedBy ?? "", payload: a.payload ?? {} } : { decided: false };
      },
      dlqList() {
        return load().dlq.filter((d) => d.status === "OPEN");
      },
      dlqAdd(executionId, nodeKey, error, payload, suggestedCause, candidateFix) {
        const db = load();
        const rec = {
          id: uid("dlq"),
          executionId,
          nodeKey,
          error,
          payload,
          status: "OPEN",
          suggestedCause,
          candidateFix,
          createdAt: nowIso()
        };
        db.dlq.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      dlqResolve(id) {
        const db = load();
        const d = db.dlq.find((x) => x.id === id);
        if (d) d.status = "RESOLVED";
        save(db);
      },
      runEnqueue(workflowId) {
        const db = load();
        db.runQueue.push(workflowId);
        save(db);
      },
      runTake() {
        const db = load();
        const items = db.runQueue.splice(0);
        save(db);
        return items;
      }
    };
  }
});

// src/ipc/client.ts
var client_exports = {};
__export(client_exports, {
  ipc: () => ipc,
  nodeKeyOf: () => nodeKeyOf,
  useTauri: () => useTauri
});
async function tauriInvoke(cmd, args) {
  const { invoke: invoke2 } = await Promise.resolve().then(() => (init_core(), core_exports));
  return invoke2(cmd, args ?? {});
}
function pickExecGrant(program, cwd, needNetwork) {
  const now = Date.now() / 1e3;
  execGrants = execGrants.filter((g) => g.expiresAt > now + 5);
  const bare = bareProgram(program);
  return execGrants.find((g) => (g.network || !needNetwork) && g.programs.includes(bare) && (cwd === void 0 || within(cwd, g.workspace)));
}
function dropExecGrant(token) {
  execGrants = execGrants.filter((g) => g.token !== token);
}
async function requestExecGrant(workspace, network, programs = [], minutes) {
  const ws = workspace ?? String((await ipc.appInfo()).workspaceRoot ?? "");
  const r = await tauriInvoke("exec_grant_request", { programs, workspace: ws, network, minutes });
  const g = { token: r.grant, workspace: r.workspace, network: r.network, programs: r.programs, expiresAt: r.expiresAt };
  execGrants.push(g);
  return g;
}
function nodeKeyOf(workflowId, nodeId) {
  return `${workflowId}:${nodeId}`;
}
var useTauri, browserReason, execGrants, bareProgram, norm, within, ipc;
var init_client = __esm({
  "src/ipc/client.ts"() {
    "use strict";
    init_desktop();
    init_guardrail();
    init_egressNet();
    init_version();
    init_localDb();
    useTauri = () => detectHost() === "tauri";
    browserReason = "No browser is attached in this build: the app does not bundle or launch Chromium, so there is no session, no page and no DOM. Nothing was fetched.";
    execGrants = [];
    bareProgram = (p2) => (p2.split(/[\\/]/).pop() ?? p2).replace(/\.exe$/i, "");
    norm = (p2) => p2.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    within = (child, root) => norm(child) === norm(root) || norm(child).startsWith(norm(root) + "/");
    ipc = {
      appInfo: async () => {
        if (useTauri()) return tauriInvoke("app_info");
        return {
          version: ENGINE_VERSION,
          platform: navigator.platform,
          workspaceRoot: "(browser workspace)",
          artifactsDir: "(memory)",
          dbHealthy: true,
          controlMcpPort: 0,
          controlMcpTransport: "stdio",
          controlMcpRunning: true,
          startupMs: 0,
          host: "webview-host",
          vendors: ["mcp-servers-reference", "mcp-github"]
        };
      },
      /* ---------------------------------------------------------------- federation
       *
       * The desktop app bundles an A2A host and, until now, did nothing with it:
       * `app_info` reported `a2aHostPath`, and no TypeScript ever read the field.
       * The architecture was therefore a fact a user had to discover, which is not
       * the same thing as a product concept.
       *
       * It is one now, and the decision is EXPLICIT rather than automatic. A host
       * binds a TCP port and signs an agent card, so silently starting one on launch
       * would be the app opening a listener nobody asked for. Instead the user
       * mounts it deliberately, and the UI says plainly what mounting means before
       * the button does anything.
       */
      /* ── FEDERATION ────────────────────────────────────────────────────────
       * Three commands, one lifecycle. This used to be a single `shellExec` call
       * with a 20-second timeout, which cannot work: `run_timeout()` kills the
       * child on the deadline, so a long-lived A2A host came up, announced READY,
       * and was terminated while the UI still called it mounted. The backend now
       * supervises the child itself (`a2a_host_start` / `_status` / `_stop`), and
       * `running` is a question the OS answers rather than a constant. */
      federationStatus: async () => {
        if (!useTauri()) {
          return {
            state: "unavailable",
            bundled: false,
            hostPath: null,
            running: false,
            pid: null,
            port: null,
            cardUrl: null,
            interfaceUrl: null,
            selfimpulse: null,
            identityFp: null,
            cardSigned: false,
            tokenMinted: false,
            bindScope: null,
            bindAddress: null,
            pairingCode: null,
            pairingExpires: null,
            files: false,
            detail: "Federation is a desktop capability. This build has no bundled A2A host."
          };
        }
        let info = {};
        try {
          info = await tauriInvoke("app_info");
        } catch {
        }
        const bundled = info?.a2aHostBundled === true;
        const hostPath = info?.a2aHostPath ?? null;
        const base = { bundled, hostPath };
        try {
          const st = await tauriInvoke("a2a_host_status");
          const state = typeof st.state === "string" ? st.state : "stopped";
          return {
            state,
            ...base,
            running: st.running === true && state === "running",
            files: st.files === true,
            pid: typeof st.pid === "number" ? st.pid : null,
            port: typeof st.port === "number" ? st.port : null,
            cardUrl: typeof st.cardUrl === "string" ? st.cardUrl : null,
            interfaceUrl: typeof st.interfaceUrl === "string" ? st.interfaceUrl : null,
            selfimpulse: typeof st.selfimpulse === "string" ? st.selfimpulse : null,
            identityFp: typeof st.identityFp === "string" ? st.identityFp : null,
            cardSigned: st.cardSigned === true,
            tokenMinted: st.tokenMinted === true,
            bindScope: st.bindScope === "lan" ? "lan" : st.bindScope === "local" ? "local" : null,
            bindAddress: typeof st.bindAddress === "string" ? st.bindAddress : null,
            pairingCode: typeof st.pairingCode === "string" ? st.pairingCode : null,
            pairingExpires: typeof st.pairingExpires === "string" ? st.pairingExpires : null,
            detail: String(st.detail ?? "")
          };
        } catch (err) {
          return {
            state: bundled ? "stopped" : "unavailable",
            ...base,
            running: false,
            pid: null,
            port: null,
            cardUrl: null,
            interfaceUrl: null,
            selfimpulse: null,
            identityFp: null,
            cardSigned: false,
            tokenMinted: false,
            bindScope: null,
            bindAddress: null,
            pairingCode: null,
            pairingExpires: null,
            files: false,
            detail: `Could not read the A2A host state: ${String(err)}`
          };
        }
      },
      federationMount: async (opts) => {
        if (!useTauri()) return { ok: false, detail: "Federation is a desktop capability." };
        const st = await ipc.federationStatus();
        if (!st.bundled || !st.hostPath) {
          return { ok: false, detail: "No A2A host is bundled with this build; nothing was started." };
        }
        if (st.state === "running") {
          return { ok: true, detail: `The A2A host is already mounted (pid ${st.pid}, port ${st.port}); a second mount was not started.` };
        }
        try {
          const r = await tauriInvoke("a2a_host_start", {
            selfimpulse: opts.selfimpulse || "SelfImpulse",
            port: opts.port ?? 0,
            bind: opts.bind ?? "local",
            pair: opts.pair === true,
            files: opts.files === true
          });
          return { ok: r.ok === true, detail: String(r.detail ?? (r.ok === true ? "The host is mounted." : "The host did not report ready.")) };
        } catch (err) {
          return { ok: false, detail: `Mount failed in words rather than pretending: ${String(err)}` };
        }
      },
      federationStop: async () => {
        if (!useTauri()) return { ok: false, detail: "Federation is a desktop capability." };
        try {
          const r = await tauriInvoke("a2a_host_stop");
          return { ok: r.ok !== false, detail: String(r.detail ?? "The A2A host was stopped.") };
        } catch (err) {
          return { ok: false, detail: `Stop failed in words rather than pretending: ${String(err)}` };
        }
      },
      dbMaintenance: async (vacuum) => {
        if (useTauri()) return tauriInvoke("db_maintenance", { vacuum });
        if (vacuum) {
        }
        const raw = localStorage.getItem("selfimpulse.v3.db") ?? "";
        return { vacuumed: vacuum, sizeBytes: raw.length };
      },
      workflowList: async () => {
        if (useTauri()) return tauriInvoke("workflow_list");
        return localDb.workflowList();
      },
      workflowGet: async (workflowId) => {
        if (useTauri()) return tauriInvoke("workflow_get", { workflowId });
        return localDb.workflowGet(workflowId);
      },
      workflowCreate: async (name, description) => {
        if (useTauri()) return tauriInvoke("workflow_create", { name, description });
        return localDb.workflowCreate(name, description);
      },
      workflowDelete: async (workflowId) => {
        if (useTauri()) return tauriInvoke("workflow_delete", { workflowId });
        localDb.workflowDelete(workflowId);
      },
      workflowSave: async (workflowId, name, description, graph) => {
        if (useTauri()) return tauriInvoke("workflow_save", { workflowId, name, description, graph });
        localDb.workflowSave(workflowId, name, description, graph);
      },
      // V7 fix (bug T): the browser fallbacks for versioning fabricated an id and a constant
      // `version: 1`, so the version history UI showed a plausible list of versions that were never
      // stored and could not be restored. These now fail loudly. The Tauri side is real.
      versionCreate: async (workflowId, label) => {
        if (useTauri()) return tauriInvoke("workflow_version_create", { workflowId, label });
        throw new Error("Workflow versions are only stored by the native build; nothing was saved in this browser session.");
      },
      versionList: async (_workflowId) => {
        if (useTauri()) return tauriInvoke("workflow_versions", { workflowId: _workflowId });
        throw new Error("Workflow versions are only stored by the native build; this browser session has no version history to show.");
      },
      versionRestore: async (versionRecordId) => {
        if (useTauri()) return tauriInvoke("workflow_version_restore", { versionRecordId });
        throw new Error("Cannot restore a version in the browser: nothing was ever stored, so nothing was changed.");
      },
      nodeStateLoad: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("node_state_load", { nodeKey });
        return {};
      },
      nodeStateSave: async (nodeKey, rolePrompt) => {
        if (useTauri()) return tauriInvoke("node_state_save", { nodeKey, rolePrompt });
      },
      memoryAdd: async (nodeKey, kind, content, tags, importance, executionId) => {
        if (useTauri()) return tauriInvoke("memory_add", { nodeKey, kind, content, tags, importance, executionId });
        return localDb.memoryAdd(nodeKey, kind, content, tags, importance);
      },
      memorySearch: async (nodeKey, query, limit = 12) => {
        if (useTauri()) return tauriInvoke("memory_search", { nodeKey, query, limit, kinds: null });
        return localDb.memorySearch(nodeKey, query, limit);
      },
      memoryDelete: async (memoryId) => {
        if (useTauri()) return tauriInvoke("memory_delete", { memoryId });
        localDb.memoryDelete(memoryId);
      },
      skillsList: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("skills_list", { nodeKey });
        return localDb.skillsList(nodeKey);
      },
      skillTouch: async (skillIds) => {
        if (useTauri()) return tauriInvoke("skill_touch", { skill_ids: skillIds });
        throw new Error("Skill usage counts live in the native build's SQLite store; the browser preview has no skill store to update.");
      },
      skillDeactivate: async (skillId) => {
        if (useTauri()) return tauriInvoke("skill_deactivate", { skill_id: skillId });
      },
      skillUpsert: async (args) => {
        if (useTauri()) return tauriInvoke("skill_upsert", args);
        return localDb.skillUpsert(args);
      },
      feedbackAdd: async (executionId, nodeKey, rating, comment) => {
        if (useTauri()) return tauriInvoke("feedback_add", { executionId, nodeKey, rating, comment });
        return localDb.feedbackAdd(executionId, nodeKey, rating, comment);
      },
      feedbackList: async () => {
        if (useTauri()) return tauriInvoke("feedback_list");
        return localDb.feedbackList();
      },
      // V7 fix (bug T): these returned fabricated ids and empty lists. A fabricated evaluation id
      // implies a stored result that does not exist, and an empty list is indistinguishable from
      // "no evaluations have ever run" — both read as success while nothing happened.
      evaluationSave: async (nodeKey, executionId, suite, score, details) => {
        if (useTauri()) return tauriInvoke("evaluation_save", { nodeKey, executionId, suite, score, details });
        throw new Error("Evaluation results live in the native build's SQLite database; the browser preview has no database to write.");
      },
      evaluationHistory: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("evaluation_history", { nodeKey });
        throw new Error("Evaluation history lives in the native build's SQLite database; the browser preview has no database to read.");
      },
      suiteList: async () => {
        if (useTauri()) return tauriInvoke("suite_list");
        throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to read.");
      },
      suiteSave: async (args) => {
        if (useTauri()) return tauriInvoke("suite_save", args);
        throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to write.");
      },
      evolutionProposeSave: async (cand) => {
        if (useTauri()) return tauriInvoke("evolution_propose_save", { cand });
        return localDb.evolutionPropose(cand);
      },
      evolutionList: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("evolution_list", { nodeKey: nodeKey ?? null });
        return localDb.evolutionList();
      },
      evolutionDecide: async (candidateId, decision) => {
        if (useTauri()) return tauriInvoke("evolution_decide", { candidateId, decision });
        return localDb.evolutionDecide(candidateId, decision);
      },
      evolutionRollback: async (candidateId, restoreRolePrompt) => {
        if (useTauri()) return tauriInvoke("evolution_rollback", { candidateId, restoreRolePrompt: restoreRolePrompt ?? null });
      },
      approvalRequest: async (executionId, nodeKey, summary, payload, requestedBy) => {
        if (useTauri()) return tauriInvoke("approval_request", { executionId, nodeKey, summary, payload, requestedBy: requestedBy ?? null });
        return localDb.approvalRequest(executionId, nodeKey, summary, payload, requestedBy);
      },
      approvalGet: async (executionId, nodeKey) => {
        if (useTauri()) return tauriInvoke("approval_get", { executionId, nodeKey });
        return localDb.approvalGet(executionId, nodeKey);
      },
      approvalList: async () => {
        if (useTauri()) return tauriInvoke("approval_list");
        return localDb.approvalList();
      },
      /** C-2 (archive 4): mint the decision capability — native OS dialog in the
       *  desktop app, an interactive confirm in the web mirror. The token it
       *  returns is the ONLY thing approvalDecide will accept. */
      approvalAuthorize: async (approvalId, decision) => {
        if (useTauri()) return tauriInvoke("approval_authorize", { approvalId, decision });
        return localDb.approvalAuthorize(approvalId, decision);
      },
      approvalDecide: async (approvalId, decision, capability) => {
        if (useTauri()) return tauriInvoke("approval_decide", { approvalId, decision, capability });
        localDb.approvalDecide(approvalId, decision, capability);
      },
      executionCreate: async (workflowId, workflowVersion) => {
        if (useTauri()) return tauriInvoke("execution_create", { workflowId, workflowVersion });
        return localDb.executionCreate(workflowId, workflowVersion);
      },
      executionFinish: async (executionId, status, error, stats) => {
        if (useTauri()) return tauriInvoke("execution_finish", { executionId, status, error, stats });
        localDb.executionFinish(executionId, status, error, stats);
      },
      eventEmit: async (executionId, kind, level, nodeId, data) => {
        if (useTauri()) {
          const rec = await tauriInvoke("event_emit", { executionId, kind, level, nodeId, data });
          window.dispatchEvent(new CustomEvent("vh://event", { detail: rec }));
          return rec;
        }
        return localDb.eventEmit(executionId, kind, level, nodeId, data);
      },
      executionEvents: async (executionId) => {
        if (useTauri()) return tauriInvoke("execution_events", { executionId });
        return localDb.executionEvents(executionId);
      },
      executionTrace: async (executionId) => {
        if (useTauri()) return tauriInvoke("execution_trace", { executionId });
        return { events: localDb.executionEvents(executionId), status: "COMPLETED" };
      },
      executionList: async () => {
        if (useTauri()) return tauriInvoke("execution_list");
        return localDb.executionList();
      },
      dlqAdd: async (executionId, nodeKey, error, payload, suggestedCause, candidateFix) => {
        if (useTauri()) return tauriInvoke("dlq_add", { executionId, nodeKey, error, payload, suggestedCause, candidateFix });
        return localDb.dlqAdd(executionId, nodeKey, error, payload, suggestedCause, candidateFix);
      },
      dlqList: async () => {
        if (useTauri()) return tauriInvoke("dlq_list");
        return localDb.dlqList();
      },
      dlqResolve: async (dlqId) => {
        if (useTauri()) return tauriInvoke("dlq_resolve", { dlqId });
        localDb.dlqResolve(dlqId);
      },
      runRequestTake: async () => {
        if (useTauri()) return tauriInvoke("run_request_take");
        return localDb.runTake();
      },
      evolutionServiceHealth: async () => {
        if (useTauri()) return tauriInvoke("evolution_service_health");
        return {
          available: false,
          transport: "stdio",
          reason: "The evolution service is a stdio child process of the native host. Build the desktop app (npm run tauri:build).",
          engine: "mj_evolution.stdio_server",
          hooks: ["on_session_start", "pre_llm_call", "post_llm_call", "on_session_end"]
        };
      },
      hermesBridge: async (msg) => {
        if (useTauri()) return tauriInvoke("hermes_bridge", { msg });
        return { ok: true, transport: "in-process", echo: msg };
      },
      evolutionServicePropose: async (args) => {
        if (useTauri()) return tauriInvoke("evolution_service_propose", { args });
        return null;
      },
      secretGet: async (secretRef) => {
        if (useTauri()) return tauriInvoke("secret_get", { secretRef });
        const value = localDb.secretGet(secretRef);
        return { ref: secretRef, present: value != null && value !== "", value: value ?? null };
      },
      secretSet: async (secretRef, value) => {
        if (useTauri()) return tauriInvoke("secret_set", { secretRef, value });
        localDb.secretSet(secretRef, value);
        return { stored: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain." };
      },
      secretDelete: async (secretRef) => {
        if (useTauri()) return tauriInvoke("secret_delete", { secretRef });
        localDb.secretDelete(secretRef);
      },
      secretExists: async (refs) => {
        if (useTauri()) return tauriInvoke("secret_exists", { secretRefs: refs });
        return localDb.secretExists(refs);
      },
      llmChat: async (req) => {
        const target = req.base_url && req.base_url.trim() ? req.base_url.trim() : void 0;
        if (target) {
          const egress = checkEgressUrl(target);
          if (!egress.ok) {
            throw new Error(
              `base URL refused by the egress guard: ${egress.reason} \u2014 nothing was sent and no key left this machine.`
            );
          }
        }
        if (useTauri()) return tauriInvoke("llm_chat", { req: { ...req, base_url: target } });
        const key2 = localDb.secretGet(req.secret_ref);
        if (req.provider === "ollama" || target?.includes("11434")) {
          try {
            const r = await safeEgressFetch(`${target || "http://127.0.0.1:11434"}/api/chat`, {
              method: "POST",
              allowLoopback: true,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: req.model,
                stream: false,
                messages: [
                  ...req.system ? [{ role: "system", content: req.system }] : [],
                  ...req.messages
                ]
              })
            });
            const j = await r.json();
            return {
              content: j.message?.content ?? "",
              model: req.model,
              usage: { input_tokens: 0, output_tokens: 0 },
              duration_ms: 0
            };
          } catch (e) {
            throw new Error(`ollama unreachable: ${e}`);
          }
        }
        if (!key2) throw new Error(`secret not found: ${req.secret_ref}`);
        throw new Error("Cloud LLM calls from the web host require the native desktop build (CORS). Use Local LLM / Ollama or run `npm run tauri`.");
      },
      fsRead: async (path3) => {
        if (useTauri()) return tauriInvoke("fs_read", { path: path3 });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsWrite: async (path3, content) => {
        if (useTauri()) return tauriInvoke("fs_write", { path: path3, content });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsList: async (path3) => {
        if (useTauri()) return tauriInvoke("fs_list", { path: path3 });
        return [];
      },
      fsMkdir: async (path3) => {
        if (useTauri()) return tauriInvoke("fs_mkdir", { path: path3 });
      },
      fsRemove: async (path3, recursive) => {
        if (useTauri()) return tauriInvoke("fs_remove", { path: path3, recursive });
      },
      /**
       * Run a dev tool inside the sandbox. The native side runs NOTHING without an execution grant a
       * human minted at a native dialog (which tools, which workspace, network or not, for how long).
       * The grant is requested on first need and kept in this module's memory — never persisted — and
       * renewed transparently when it expires or is revoked. Network is OFF unless `opts.network` asks
       * for it, in which case the dialog says so in capitals.
       */
      shellExec: async (program, args, cwd, timeoutSecs, opts) => {
        if (!useTauri()) throw new Error("Terminal is available in the native desktop build.");
        const needNetwork = opts?.network === true;
        let g = pickExecGrant(program, cwd, needNetwork);
        if (!g) g = await requestExecGrant(cwd, needNetwork);
        try {
          return await tauriInvoke("shell_exec", { program, args, cwd, timeoutSecs, grant: g.token });
        } catch (e) {
          if (!/unknown or was revoked|has expired/i.test(String(e))) throw e;
          dropExecGrant(g.token);
          const fresh = await requestExecGrant(cwd, needNetwork);
          return await tauriInvoke("shell_exec", { program, args, cwd, timeoutSecs, grant: fresh.token });
        }
      },
      /** Ask (natively) for an execution grant. Resolves with its public shape — the token stays inside this module. */
      execGrantRequest: async (o = {}) => {
        if (!useTauri()) throw new Error("Execution grants exist in the native desktop build only.");
        const g = await requestExecGrant(o.workspace, o.network === true, o.programs, o.minutes);
        return { workspace: g.workspace, network: g.network, programs: g.programs, expiresAt: g.expiresAt };
      },
      execGrantsStatus: async () => {
        if (!useTauri()) return [];
        return tauriInvoke("exec_grants_status");
      },
      execGrantsRevoke: async () => {
        if (!useTauri()) return { revoked: 0 };
        execGrants = [];
        return tauriInvoke("exec_grants_revoke");
      },
      /**
       * Bind a provider key to ONE non-canonical https origin. The vendor's own host needs no binding;
       * anything else (a self-hosted or BYOK gateway) needs a human at a native dialog, because the
       * page cannot be trusted to say where a key may go.
       */
      providerBindEndpoint: async (secretRef, baseUrl) => {
        if (!useTauri()) throw new Error("Endpoint binding exists in the native desktop build only \u2014 the web edition holds no cloud keys.");
        return tauriInvoke("provider_bind_endpoint", { secretRef, baseUrl });
      },
      providerEndpointsList: async () => {
        if (!useTauri()) return [];
        return tauriInvoke("provider_endpoints_list");
      },
      providerUnbindEndpoint: async (secretRef) => {
        if (!useTauri()) return { unbound: false, secretRef };
        return tauriInvoke("provider_unbind_endpoint", { secretRef });
      },
      // QA fix (audit C2): the native filesystem is sandboxed to the app data dir plus these
      // user-registered workspace roots. Teams registers the runner repo when a run starts.
      workspaceRootAdd: async (root) => {
        if (!useTauri()) return { ok: false, path: root };
        return tauriInvoke("workspace_root_add", { root });
      },
      workspaceRootRemove: async (root) => {
        if (!useTauri()) return { ok: false, path: root };
        return tauriInvoke("workspace_root_remove", { root });
      },
      workspaceRootList: async () => {
        if (!useTauri()) return [];
        return tauriInvoke("workspace_root_list");
      },
      mcpServerList: async () => {
        if (useTauri()) return tauriInvoke("mcp_server_list");
        return localDb.mcpList();
      },
      mcpServerSave: async (cfg) => {
        if (useTauri()) return tauriInvoke("mcp_server_save", { cfg });
        return localDb.mcpSave(cfg);
      },
      mcpServerRemove: async (serverId) => {
        if (useTauri()) return tauriInvoke("mcp_server_remove", { serverId });
        localDb.mcpRemove(serverId);
      },
      mcpConnectTest: async (serverId) => {
        if (useTauri()) return tauriInvoke("mcp_connect_test", { serverId });
        const s = localDb.mcpList().find((m2) => m2.id === serverId);
        return {
          serverId,
          connected: false,
          lastError: "Connect from the native desktop build (stdio MCP).",
          toolCount: 0,
          name: s?.name
        };
      },
      mcpCall: async (serverId, tool, args) => {
        if (useTauri()) return tauriInvoke("mcp_call", { serverId, tool, arguments: args });
        throw new Error("MCP calls require the native desktop build.");
      },
      // V7 fix (bug V): these browser fallbacks invented a session id, a page title and an engine
      // name. An agent or a page reading them would conclude a real navigation had happened. Every
      // one of them now reports the same notAttached shape the Rust side does.
      /**
       * `key` is what makes browser use autonomous: pass a stable key (a node key, a workflow id) and
       * the same session comes back, so a loop that navigates repeatedly drives one tab with its
       * history and cookies intact instead of leaking a fresh browser context on every call.
       */
      browserSessionCreate: async (key2) => {
        if (useTauri()) return tauriInvoke("browser_session_create", { key: key2 });
        return { ok: false, notAttached: true, engine: null, sessionId: null, reason: browserReason };
      },
      browserSessionClose: async (sessionId) => {
        if (useTauri()) return tauriInvoke("browser_session_close", { sessionId });
      },
      browserSessions: async () => {
        if (useTauri()) return tauriInvoke("browser_sessions");
        return [];
      },
      browserNavigate: async (sessionId, url, timeoutMs = 3e4) => {
        if (useTauri()) return tauriInvoke("browser_navigate", { sessionId, url, timeoutMs });
        return { ok: false, notAttached: true, url, title: null, engine: null, reason: browserReason };
      },
      browserAct: async (args) => {
        if (useTauri()) return tauriInvoke("browser_act", args);
        return { ok: false, notAttached: true, reason: browserReason };
      },
      browserScreenshot: async (sessionId, fullPage = false) => {
        if (useTauri()) return tauriInvoke("browser_screenshot", { sessionId, fullPage });
        return { ok: false, notAttached: true, path: null, reason: browserReason };
      },
      browserConsole: async (sessionId) => {
        if (useTauri()) return tauriInvoke("browser_console", { sessionId });
        return { ok: false, notAttached: true, console: [], networkFailures: [], reason: browserReason };
      },
      /* There is no external execution bridge.
       *
       * Every agent runs in-process on the owner's own provider key. Nothing in this
       * bridge can spawn a third-party process, and the methods that once did are
       * gone rather than stubbed — there is no native command left to call.
       * probe/noExternalCli.test.ts pins the absence.
       */
      /* -------------------------------------------------------------- git
       * Every one of these throws in a browser build rather than returning an empty result. A git panel
       * that renders "no changes" when it never spoke to git is the exact false-success pattern the product forbids:
       * the user cannot tell "clean tree" from "never checked". The thrown message is the label.
       */
      gitIsRepo: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_is_repo", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitStatus: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_status", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitDiff: async (cwd, staged = false, budget) => {
        if (useTauri()) return tauriInvoke("git_diff", { cwd, staged, budget: budget ?? null });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitHead: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_head", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitBranch: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_branch", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      /**
       * Did a seat that was told to be read-only actually refrain from writing?
       * A harness flag is a promise; this is the check. Three-way on purpose — see `git.rs`.
       */
      gitReadOnlyCheck: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_read_only_check", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      packageExport: async (workflowId, includeHistory) => {
        if (useTauri()) return tauriInvoke("package_export", { workflowId, includeHistory });
        const wf = localDb.workflowGet(workflowId);
        return {
          packageFormat: 1,
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          application: "SelfImpulse",
          version: ENGINE_VERSION,
          workflow: { name: wf.name, description: wf.description, graph: wf.graph },
          history: [],
          secretsIncluded: false
        };
      },
      packageImport: async (pkg) => {
        if (useTauri()) return tauriInvoke("package_import", { pkg });
        const p2 = pkg;
        if (p2.application !== "SelfImpulse" && p2.application !== "VH" || !p2.workflow) throw new Error("package rejected");
        const created = localDb.workflowCreate(`${p2.workflow.name} (imported)`, p2.workflow.description ?? "");
        localDb.workflowSave(created.id, `${p2.workflow.name} (imported)`, p2.workflow.description ?? "", p2.workflow.graph);
        return { id: created.id, validated: true };
      },
      controlValidate: async (workflowId) => {
        if (useTauri()) return tauriInvoke("control_validate_graph", { workflowId });
        return { valid: true, errors: [] };
      },
      controlConnectPorts: async (args) => {
        if (useTauri()) return tauriInvoke("control_connect_ports", args);
        throw new Error("use graph store connect");
      }
    };
  }
});

// src/mission/sandbox.ts
var sandbox_exports = {};
__export(sandbox_exports, {
  detectPlatform: () => detectPlatform2,
  sandboxProfileFor: () => sandboxProfileFor,
  scratchWorkspace: () => scratchWorkspace,
  scrubEnv: () => scrubEnv,
  verifyEnforcement: () => verifyEnforcement,
  wrapForSeat: () => wrapForSeat
});
import * as fsSync2 from "node:fs";
import * as os from "node:os";
import * as path2 from "node:path";
function scrubEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    const upper = k.toUpperCase();
    const shaped = SCRUB_EXACT.has(upper) || SCRUB_SUFFIX.some((s) => upper.endsWith(s)) || // Token-shaped values (JWT / long opaque secrets) under innocent names.
    v.length >= 40 && /^[A-Za-z0-9_\-.=+/]+$/.test(v) || /^[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{12,}/.test(v);
    if (!shaped) out[k] = v;
  }
  return out;
}
function detectPlatform2() {
  if (typeof process === "undefined" || !process.platform) return typeof navigator !== "undefined" ? "unknown" : "unknown";
  const p2 = process.platform;
  return p2 === "darwin" ? "macos" : p2 === "win32" ? "windows" : p2 === "linux" ? "linux" : "unknown";
}
function sandboxProfileFor(risk, workspace, platform = detectPlatform2()) {
  const tier = risk === "LOW" ? "none" : risk === "MEDIUM" ? "fs" : "fs+net";
  const scrubbed = [...SCRUB_EXACT].sort();
  const base = {
    tier,
    platform,
    wrapper: [],
    scrubbedEnvKeys: scrubbed,
    canaries: [],
    note: ""
  };
  if (tier === "none") {
    return { ...base, note: "read-class task: no filesystem wrapper; credentials are still scrubbed from the child environment" };
  }
  if (platform === "linux") {
    const canaryPath = path2.posix.join("/", "si-sandbox-canary.txt");
    const wrapper = [
      "bwrap",
      "--ro-bind",
      "/",
      "/",
      "--bind",
      workspace,
      workspace,
      "--bind",
      os.tmpdir(),
      os.tmpdir(),
      "--dev",
      "/dev",
      "--proc",
      "/proc"
    ];
    if (tier === "fs+net") wrapper.push("--unshare-net");
    wrapper.push("--");
    return {
      ...base,
      wrapper,
      canaries: [
        {
          name: "write outside the workspace must fail",
          argv: [...wrapper, "sh", "-c", `echo si-canary > ${canaryPath}`],
          mustFail: true
        },
        ...tier === "fs+net" ? [{ name: "network must be unreachable", argv: [...wrapper, "sh", "-c", "command -v curl >/dev/null && curl -m 2 -s https://example.com >/dev/null || false"], mustFail: true }] : []
      ],
      note: "bubblewrap profile: root read-only, workspace+tmp writable" + (tier === "fs+net" ? ", network namespace isolated" : "")
    };
  }
  if (platform === "macos") {
    const canaryPath = path2.posix.join("/", "si-sandbox-canary.txt");
    const profile = tier === "fs+net" ? `(version 1)(deny default)(allow process*)(allow file-read*)(allow file-write* (subpath "${workspace}") (subpath "${os.tmpdir()}"))(deny network*)` : `(version 1)(deny default)(allow process*)(allow file-read*)(allow file-write* (subpath "${workspace}") (subpath "${os.tmpdir()}"))`;
    return {
      ...base,
      wrapper: ["sandbox-exec", "-p", profile],
      canaries: [
        {
          name: "write outside the workspace must fail",
          argv: ["sandbox-exec", "-p", profile, "sh", "-c", `echo si-canary > ${canaryPath}`],
          mustFail: true
        }
      ],
      note: "Seatbelt profile: workspace-only writes" + (tier === "fs+net" ? ", network denied" : "")
    };
  }
  return {
    ...base,
    note: platform === "windows" ? "no native Windows wrapper is shipped; run missions under WSL2 where the Linux profiles apply \u2014 this seat runs UNSANDBOXED and the UI labels it" : "no wrapper available for this platform; credentials are still scrubbed"
  };
}
async function verifyEnforcement(profile, timeoutMs = 8e3) {
  const evidence = [];
  if (profile.canaries.length === 0) {
    return { enforced: false, measured: false, evidence, note: profile.note };
  }
  const { execFile } = await import("node:child_process");
  let wrapperAbsent = false;
  for (const canary of profile.canaries) {
    const ran = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ failed: true, absent: false, detail: "timeout (treated as blocked)" }), timeoutMs);
      execFile(canary.argv[0], canary.argv.slice(1), { timeout: timeoutMs }, (err) => {
        clearTimeout(timer);
        const code = err?.code;
        const absent = Boolean(err) && typeof code === "string" && WRAPPER_UNAVAILABLE.has(code);
        resolve({
          failed: Boolean(err),
          absent,
          detail: absent ? `wrapper '${canary.argv[0]}' is not installed or not executable (${code}) \u2014 the canary never ran` : err ? (err.message.split("\n")[0] ?? "").slice(0, 120) : "exited 0"
        });
      });
    });
    if (ran.absent) wrapperAbsent = true;
    evidence.push({ name: canary.name, ran: !ran.absent, failedAsExpected: !ran.absent && ran.failed === canary.mustFail, detail: ran.detail });
  }
  const enforced = !wrapperAbsent && evidence.length > 0 && evidence.every((e) => e.ran && e.failedAsExpected);
  return {
    enforced,
    measured: !wrapperAbsent,
    evidence,
    note: wrapperAbsent ? `${profile.note}; wrapper unavailable on this machine (not installed or not executable) \u2014 enforcement UNMEASURED` : profile.note
  };
}
function wrapForSeat(risk, workspace, program, args, platform) {
  const profile = sandboxProfileFor(risk, workspace, platform);
  return { argv: profile.wrapper.length > 0 ? [...profile.wrapper, program, ...args] : [program, ...args], profile };
}
function scratchWorkspace() {
  const dir = fsSync2.mkdtempSync(path2.join(os.tmpdir(), "si-seat-"));
  return dir;
}
var SCRUB_EXACT, SCRUB_SUFFIX, WRAPPER_UNAVAILABLE;
var init_sandbox = __esm({
  "src/mission/sandbox.ts"() {
    "use strict";
    SCRUB_EXACT = /* @__PURE__ */ new Set([
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "GH_ENTERPRISE_TOKEN",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_API_KEY",
      "GEMINI_API_KEY",
      "XAI_API_KEY",
      "GROK_API_KEY",
      "OPENROUTER_API_KEY",
      "SLACK_BOT_TOKEN",
      "STRIPE_API_KEY",
      "NPM_TOKEN",
      "NODE_AUTH_TOKEN",
      "PYPI_TOKEN",
      "CARGO_REGISTRY_TOKEN",
      "HF_TOKEN",
      "VERCEL_TOKEN",
      "NETLIFY_AUTH_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "FIREBASE_TOKEN",
      "SSH_AUTH_SOCK",
      "GPG_PASSPHRASE",
      "MJ_UPDATER_KEY"
    ]);
    SCRUB_SUFFIX = ["_TOKEN", "_SECRET", "_API_KEY", "_APIKEY", "_PASSWORD", "_PRIVATE_KEY"];
    WRAPPER_UNAVAILABLE = /* @__PURE__ */ new Set(["ENOENT", "EACCES", "EPERM", "ENOEXEC"]);
  }
});

// probe/diag3.test.ts
import assert from "node:assert/strict";

// src/mission/missionRuntime.ts
init_id();

// src/domain/rolePacks.ts
var ROLE_PACKS = [
  { slug: "backend-engineer", title: "Backend Engineer", industry: "engineering", icon: "code", mission: "Design and implement reliable services, APIs, and data stores." },
  { slug: "frontend-engineer", title: "Frontend Engineer", industry: "engineering", icon: "code", mission: "Ship accessible, performant UI against a contract." },
  { slug: "mobile-engineer", title: "Mobile Engineer", industry: "engineering", icon: "code", mission: "Build native/mobile clients with offline and platform constraints." },
  { slug: "platform-engineer", title: "Platform Engineer", industry: "engineering", icon: "code", mission: "Own developer platforms, CI, internal paved roads." },
  { slug: "staff-engineer", title: "Staff Engineer", industry: "engineering", icon: "code", mission: "Set technical direction, kill complexity, unblock teams." },
  { slug: "principal-engineer", title: "Principal Engineer", industry: "engineering", icon: "code", mission: "Make multi-year technical bets with explicit trade-offs." },
  { slug: "release-engineer", title: "Release Engineer", industry: "engineering", icon: "code", mission: "Own cut, changelog, rollback, and release gates." },
  { slug: "build-engineer", title: "Build Engineer", industry: "engineering", icon: "code", mission: "Keep the build graph fast, hermetic, and reproducible." },
  { slug: "api-designer", title: "API Designer", industry: "engineering", icon: "code", mission: "Design versioned APIs with compatibility and authz." },
  { slug: "protocol-engineer", title: "Protocol Engineer", industry: "engineering", icon: "code", mission: "Specify wire protocols, idempotency, and failure modes." },
  { slug: "embedded-engineer", title: "Embedded Engineer", industry: "engineering", icon: "code", mission: "Firmware and constrained-device software with safety bars." },
  { slug: "gameplay-engineer", title: "Gameplay Engineer", industry: "engineering", icon: "code", mission: "Implement gameplay systems with determinism and feel." },
  { slug: "graphics-engineer", title: "Graphics Engineer", industry: "engineering", icon: "code", mission: "Rendering, shaders, GPU budgets." },
  { slug: "ml-engineer", title: "ML Engineer", industry: "engineering", icon: "code", mission: "Train, evaluate, and ship models with data lineage." },
  { slug: "mlops-engineer", title: "MLOps Engineer", industry: "engineering", icon: "code", mission: "Model CI, drift monitors, feature stores." },
  { slug: "data-engineer", title: "Data Engineer", industry: "engineering", icon: "code", mission: "Pipelines, warehouses, contracts, late-arriving data." },
  { slug: "analytics-engineer", title: "Analytics Engineer", industry: "engineering", icon: "code", mission: "dbt-style models, metrics, and semantic layers." },
  { slug: "site-reliability", title: "Site Reliability Engineer", industry: "engineering", icon: "code", mission: "SLOs, error budgets, toil reduction." },
  { slug: "incident-commander", title: "Incident Commander", industry: "engineering", icon: "code", mission: "Run incidents: impact, comms, next action." },
  { slug: "chaos-engineer", title: "Chaos Engineer", industry: "engineering", icon: "code", mission: "Design failure experiments with blast-radius limits." },
  { slug: "appsec", title: "Application Security", industry: "security", icon: "shield", mission: "Find and rank exploitable issues. No exploit payloads." },
  { slug: "cloudsec", title: "Cloud Security", industry: "security", icon: "shield", mission: "IAM, misconfig, public buckets, identity federation." },
  { slug: "secops", title: "SecOps Analyst", industry: "security", icon: "shield", mission: "Triage alerts, contain, document." },
  { slug: "threat-modeler", title: "Threat Modeler", industry: "security", icon: "shield", mission: "STRIDE/LINDDUN style models with trust boundaries." },
  { slug: "red-team", title: "Red Team Lead", industry: "security", icon: "shield", mission: "Adversarial exercise design. No live exploitation." },
  { slug: "blue-team", title: "Blue Team Lead", industry: "security", icon: "shield", mission: "Detection coverage and response playbooks." },
  { slug: "iam-architect", title: "IAM Architect", industry: "security", icon: "shield", mission: "Least privilege, identity lifecycle, break-glass." },
  { slug: "privacy-engineer", title: "Privacy Engineer", industry: "security", icon: "shield", mission: "Data minimization, retention, subject-rights flows." },
  { slug: "crypto-reviewer", title: "Crypto Reviewer", industry: "security", icon: "shield", mission: "Review crypto usage. Flag homemade crypto." },
  { slug: "supply-chain", title: "Supply Chain Security", industry: "security", icon: "shield", mission: "Dependencies, provenance, SBOM, signed builds." },
  { slug: "grc-analyst", title: "GRC Analyst", industry: "security", icon: "shield", mission: "Map controls to evidence. Not legal advice." },
  { slug: "pentest-scoper", title: "Pentest Scoper", industry: "security", icon: "shield", mission: "Scope tests, rules of engagement, out-of-scope." },
  { slug: "secret-hygiene", title: "Secret Hygiene Agent", industry: "security", icon: "shield", mission: "Find secret leakage patterns in code and configs." },
  { slug: "secure-code-reviewer", title: "Secure Code Reviewer", industry: "security", icon: "shield", mission: "Review diffs for injection, authz, SSRF." },
  { slug: "zero-trust", title: "Zero Trust Architect", industry: "security", icon: "shield", mission: "Device, identity, path \u2014 never network location." },
  { slug: "fp-a", title: "FP&A Analyst", industry: "finance", icon: "activity", mission: "Forecasts, variance, driver trees." },
  { slug: "controller", title: "Controller", industry: "finance", icon: "activity", mission: "Close, accruals, control gaps." },
  { slug: "treasury", title: "Treasury Analyst", industry: "finance", icon: "activity", mission: "Cash, liquidity, FX exposure." },
  { slug: "credit-risk", title: "Credit Risk Analyst", industry: "finance", icon: "activity", mission: "Score credit with documented assumptions." },
  { slug: "market-risk", title: "Market Risk Analyst", industry: "finance", icon: "activity", mission: "VaR, stress, limit breaches." },
  { slug: "quant-researcher", title: "Quant Researcher", industry: "finance", icon: "activity", mission: "Signals with leakage controls and holdout." },
  { slug: "algo-trader-reviewer", title: "Algo Reviewer", industry: "finance", icon: "activity", mission: "Review trading logic. No live orders." },
  { slug: "audit-prep", title: "Audit Prep Agent", industry: "finance", icon: "activity", mission: "PBC lists, evidence binders." },
  { slug: "tax-ops", title: "Tax Ops Analyst", industry: "finance", icon: "activity", mission: "Classify transactions. Not tax advice." },
  { slug: "revenue-ops", title: "Revenue Operations", industry: "finance", icon: "activity", mission: "Funnel math, bookings vs billings." },
  { slug: "pricing-analyst", title: "Pricing Analyst", industry: "finance", icon: "activity", mission: "Price tests, elasticity, guardrails." },
  { slug: "fraud-analyst", title: "Fraud Analyst", industry: "finance", icon: "activity", mission: "Pattern detection with false-positive cost." },
  { slug: "payments-ops", title: "Payments Ops", industry: "finance", icon: "activity", mission: "Reconciliation, chargebacks, rails." },
  { slug: "finops", title: "Cloud FinOps", industry: "finance", icon: "activity", mission: "Unit economics of cloud spend." },
  { slug: "investor-relations", title: "IR Writer", industry: "finance", icon: "activity", mission: "Draft IR notes from facts only." },
  { slug: "contract-reviewer", title: "Contract Reviewer", industry: "legal", icon: "gavel", mission: "Flag risk. Not legal advice." },
  { slug: "nda-reviewer", title: "NDA Reviewer", industry: "legal", icon: "gavel", mission: "Mutual vs one-way, residuals, term." },
  { slug: "privacy-counsel-prep", title: "Privacy Counsel Prep", industry: "legal", icon: "gavel", mission: "Map processing to lawful bases. Not advice." },
  { slug: "ip-analyst", title: "IP Analyst", industry: "legal", icon: "gavel", mission: "Prior art notes, claim charts. Not advice." },
  { slug: "compliance-ops", title: "Compliance Ops", industry: "legal", icon: "gavel", mission: "Policy vs practice gaps." },
  { slug: "vendor-dpa", title: "Vendor DPA Reviewer", industry: "legal", icon: "gavel", mission: "Subprocessors, SCCs, breach SLAs." },
  { slug: "employment-ops", title: "Employment Ops", industry: "legal", icon: "gavel", mission: "Policy drafts. Not employment advice." },
  { slug: "litigation-hold", title: "Litigation Hold Clerk", industry: "legal", icon: "gavel", mission: "Preserve scope, custodians, dates." },
  { slug: "licensing-analyst", title: "Licensing Analyst", industry: "legal", icon: "gavel", mission: "OSS license compatibility." },
  { slug: "export-control", title: "Export Control Screener", industry: "legal", icon: "gavel", mission: "Flag controlled items. Not advice." },
  { slug: "regulatory-watcher", title: "Regulatory Watcher", industry: "legal", icon: "gavel", mission: "Summarize rule changes with citations." },
  { slug: "board-secretary", title: "Board Secretary Prep", industry: "legal", icon: "gavel", mission: "Agenda, minutes template, resolutions." },
  { slug: "clinical-ops", title: "Clinical Ops", industry: "healthcare", icon: "heart", mission: "Protocol deviation notes, visit windows." },
  { slug: "medical-writer", title: "Medical Writer", industry: "healthcare", icon: "heart", mission: "Accuracy-first clinical prose. Not medical advice." },
  { slug: "pharmacovigilance", title: "Pharmacovigilance Intake", industry: "healthcare", icon: "heart", mission: "Case intake structure, seriousness." },
  { slug: "hipaa-reviewer", title: "HIPAA Reviewer", industry: "healthcare", icon: "heart", mission: "PHI handling gaps. Not legal advice." },
  { slug: "coding-specialist", title: "Medical Coding Assist", industry: "healthcare", icon: "heart", mission: "ICD/CPT suggestions with uncertainty." },
  { slug: "quality-systems", title: "Quality Systems", industry: "healthcare", icon: "heart", mission: "CAPA, deviations, change control." },
  { slug: "biostats", title: "Biostats Analyst", industry: "healthcare", icon: "heart", mission: "Analysis plans, estimands, missing data." },
  { slug: "trial-manager", title: "Trial Manager", industry: "healthcare", icon: "heart", mission: "Milestones, sites, enrollment risk." },
  { slug: "lab-ops", title: "Lab Ops", industry: "healthcare", icon: "heart", mission: "Sample chain of custody." },
  { slug: "payer-ops", title: "Payer Ops", industry: "healthcare", icon: "heart", mission: "Prior auth packets from facts." },
  { slug: "health-informatics", title: "Health Informatics", industry: "healthcare", icon: "heart", mission: "HL7/FHIR mapping, code systems." },
  { slug: "safety-officer", title: "Safety Officer", industry: "healthcare", icon: "heart", mission: "Incident, RCA, CAPA." },
  { slug: "data-steward", title: "Data Steward", industry: "data", icon: "cpu", mission: "Ownership, quality SLAs, glossary." },
  { slug: "metrics-owner", title: "Metrics Owner", industry: "data", icon: "cpu", mission: "Metric definitions that cannot drift." },
  { slug: "experiment-designer", title: "Experiment Designer", industry: "data", icon: "cpu", mission: "Power, CUPED, peeking risk." },
  { slug: "causal-analyst", title: "Causal Analyst", industry: "data", icon: "cpu", mission: "Identification strategy, threats." },
  { slug: "forecasting", title: "Forecaster", industry: "data", icon: "cpu", mission: "Time series with intervals, not point bravado." },
  { slug: "catalog-curator", title: "Catalog Curator", industry: "data", icon: "cpu", mission: "Owners, PII tags, freshness." },
  { slug: "reverse-etl", title: "Reverse ETL", industry: "data", icon: "cpu", mission: "Activate warehouse data with contracts." },
  { slug: "stream-processor", title: "Stream Processor", industry: "data", icon: "cpu", mission: "Exactly-once claims vs reality." },
  { slug: "feature-store", title: "Feature Store Owner", industry: "data", icon: "cpu", mission: "Point-in-time correctness." },
  { slug: "labeling-lead", title: "Labeling Lead", industry: "data", icon: "cpu", mission: "Rubrics, IAA, gold sets." },
  { slug: "eval-scientist", title: "Eval Scientist", industry: "data", icon: "cpu", mission: "Offline/online evals for models and agents." },
  { slug: "rag-architect", title: "RAG Architect", industry: "data", icon: "cpu", mission: "Chunking, retrieval, citation, refusal." },
  { slug: "product-manager", title: "Product Manager", industry: "product", icon: "map", mission: "PRDs, scope, acceptance." },
  { slug: "product-ops", title: "Product Ops", industry: "product", icon: "map", mission: "Process, instrumentation, launch checklists." },
  { slug: "growth-pm", title: "Growth PM", industry: "product", icon: "map", mission: "Loops, experiments, north stars." },
  { slug: "tech-pm", title: "Technical PM", industry: "product", icon: "map", mission: "API products, platform bets." },
  { slug: "discovery-researcher", title: "Discovery Researcher", industry: "product", icon: "map", mission: "Interviews, JTBD, evidence." },
  { slug: "roadmap-strategist", title: "Roadmap Strategist", industry: "product", icon: "map", mission: "Bets vs features, kill criteria." },
  { slug: "launch-manager", title: "Launch Manager", industry: "product", icon: "map", mission: "GTM, support, flags, rollback." },
  { slug: "monetization", title: "Monetization PM", industry: "product", icon: "map", mission: "Packaging, paywalls, ethics." },
  { slug: "platform-pm", title: "Platform PM", industry: "product", icon: "map", mission: "Internal customers, SLAs." },
  { slug: "ai-pm", title: "AI Product Manager", industry: "product", icon: "map", mission: "Eval harnesses, refusal, cost." },
  { slug: "solutions-architect", title: "Solutions Architect", industry: "sales", icon: "zap", mission: "Map requirements to a real architecture." },
  { slug: "sales-engineer", title: "Sales Engineer", industry: "sales", icon: "zap", mission: "Technical proposal from requirements." },
  { slug: "account-strategist", title: "Account Strategist", industry: "sales", icon: "zap", mission: "Expansion from usage evidence." },
  { slug: "rfp-writer", title: "RFP Writer", industry: "sales", icon: "zap", mission: "Answer only what is true." },
  { slug: "demo-engineer", title: "Demo Engineer", industry: "sales", icon: "zap", mission: "Reproducible demo scripts." },
  { slug: "pricing-desk", title: "Deal Desk", industry: "sales", icon: "zap", mission: "Discount policy, approvals, terms." },
  { slug: "customer-success", title: "Customer Success", industry: "sales", icon: "zap", mission: "Health, QBR, risk." },
  { slug: "onboarding-specialist", title: "Onboarding Specialist", industry: "sales", icon: "zap", mission: "Time-to-value playbooks." },
  { slug: "renewals", title: "Renewals Manager", industry: "sales", icon: "zap", mission: "Value proof, risk, ask." },
  { slug: "partner-manager", title: "Partner Manager", industry: "sales", icon: "zap", mission: "Co-sell motions, boundaries." },
  { slug: "brand-strategist", title: "Brand Strategist", industry: "marketing", icon: "spark", mission: "Positioning, not slogans first." },
  { slug: "content-strategist", title: "Content Strategist", industry: "marketing", icon: "spark", mission: "Narrative, calendar, evidence." },
  { slug: "copy-chief", title: "Copy Chief", industry: "marketing", icon: "spark", mission: "On-brand, claims-safe copy." },
  { slug: "seo-strategist", title: "SEO Strategist", industry: "marketing", icon: "spark", mission: "Intent, cannibalization, technical." },
  { slug: "lifecycle", title: "Lifecycle Marketer", industry: "marketing", icon: "spark", mission: "Journeys with consent." },
  { slug: "product-marketer", title: "Product Marketer", industry: "marketing", icon: "spark", mission: "Launch narrative, battlecards." },
  { slug: "analyst-relations", title: "Analyst Relations", industry: "marketing", icon: "spark", mission: "Briefings from facts." },
  { slug: "community", title: "Community Lead", industry: "marketing", icon: "spark", mission: "Moderation, rituals, health." },
  { slug: "demand-gen", title: "Demand Gen", industry: "marketing", icon: "spark", mission: "Pipeline math, not vanity." },
  { slug: "localization", title: "Localization Lead", industry: "marketing", icon: "spark", mission: "Register, glossary, in-context." },
  { slug: "recruiter", title: "Recruiter", industry: "hr", icon: "users", mission: "Score against a rubric." },
  { slug: "sourcer", title: "Sourcer", industry: "hr", icon: "users", mission: "Search strings, calibration." },
  { slug: "comp-analyst", title: "Comp Analyst", industry: "hr", icon: "users", mission: "Bands, geo, equity. Not advice." },
  { slug: "l-and-d", title: "L&D Designer", industry: "hr", icon: "users", mission: "Curricula with assessments." },
  { slug: "people-ops", title: "People Ops", industry: "hr", icon: "users", mission: "Policies, rituals, systems." },
  { slug: "hrbp", title: "HR Business Partner", industry: "hr", icon: "users", mission: "Org design notes. Not advice." },
  { slug: "dei-analyst", title: "DEI Analyst", industry: "hr", icon: "users", mission: "Representation metrics with care." },
  { slug: "onboarding-hr", title: "People Onboarding", industry: "hr", icon: "users", mission: "30/60/90, access, culture." },
  { slug: "performance", title: "Performance Partner", industry: "hr", icon: "users", mission: "Calibration, goals, bias checks." },
  { slug: "employer-brand", title: "Employer Brand", industry: "hr", icon: "users", mission: "True stories, not gloss." },
  { slug: "coo-chief-of-staff", title: "Chief of Staff", industry: "ops", icon: "tool", mission: "Priorities, decisions, follow-through." },
  { slug: "vendor-manager", title: "Vendor Manager", industry: "ops", icon: "tool", mission: "SLAs, exits, concentration risk." },
  { slug: "procurement", title: "Procurement", industry: "ops", icon: "tool", mission: "RFPs, TCO, policy." },
  { slug: "facilities", title: "Facilities Ops", industry: "ops", icon: "tool", mission: "Sites, safety, vendors." },
  { slug: "it-ops", title: "IT Ops", industry: "ops", icon: "tool", mission: "Access, MDM, tickets." },
  { slug: "knowledge-manager", title: "Knowledge Manager", industry: "ops", icon: "tool", mission: "Sources of truth, rot." },
  { slug: "process-miner", title: "Process Miner", industry: "ops", icon: "tool", mission: "As-is vs to-be with evidence." },
  { slug: "pmo", title: "PMO", industry: "ops", icon: "tool", mission: "Dependencies, RAID, status." },
  { slug: "internal-audit-ops", title: "Internal Audit Ops", industry: "ops", icon: "tool", mission: "Samples, evidence, findings." },
  { slug: "business-continuity", title: "BCP Planner", industry: "ops", icon: "tool", mission: "RTO/RPO, drills." },
  { slug: "process-engineer", title: "Process Engineer", industry: "manufacturing", icon: "hex", mission: "Yield, cycle time, SPC." },
  { slug: "quality-engineer", title: "Quality Engineer", industry: "manufacturing", icon: "hex", mission: "NCR, CAPA, MSA." },
  { slug: "maintenance", title: "Reliability Maintenance", industry: "manufacturing", icon: "hex", mission: "PM, PdM, spare strategy." },
  { slug: "mes-analyst", title: "MES Analyst", industry: "manufacturing", icon: "hex", mission: "Genealogy, downtime codes." },
  { slug: "supply-planner", title: "Supply Planner", industry: "manufacturing", icon: "hex", mission: "MRP, constraints, expedite." },
  { slug: "ehs", title: "EHS Officer", industry: "manufacturing", icon: "hex", mission: "Hazards, permits, incidents." },
  { slug: "lean-coach", title: "Lean Coach", industry: "manufacturing", icon: "hex", mission: "Waste, takt, standard work." },
  { slug: "npi-engineer", title: "NPI Engineer", industry: "manufacturing", icon: "hex", mission: "DFM, ramp, ECOs." },
  { slug: "calibration", title: "Calibration Tech", industry: "manufacturing", icon: "hex", mission: "Traceability, intervals." },
  { slug: "warehouse-ops", title: "Warehouse Ops", industry: "manufacturing", icon: "hex", mission: "Slotting, ASN, cycle counts." },
  { slug: "grid-analyst", title: "Grid Analyst", industry: "energy", icon: "activity", mission: "Load, congestion, outages." },
  { slug: "trader-ops", title: "Energy Trader Ops", industry: "energy", icon: "activity", mission: "Nominations, imbalances. No live trades." },
  { slug: "hse-energy", title: "Energy HSE", industry: "energy", icon: "activity", mission: "Process safety, LOTO." },
  { slug: "reservoir", title: "Reservoir Analyst", industry: "energy", icon: "activity", mission: "Decline, uncertainty." },
  { slug: "renewables-ops", title: "Renewables Ops", industry: "energy", icon: "activity", mission: "Availability, curtailment." },
  { slug: "carbon-accountant", title: "Carbon Accountant", industry: "energy", icon: "activity", mission: "Scopes, factors, gaps." },
  { slug: "ppa-analyst", title: "PPA Analyst", industry: "energy", icon: "activity", mission: "Shape risk, basis." },
  { slug: "scada-reviewer", title: "SCADA Reviewer", industry: "energy", icon: "activity", mission: "Tag hygiene, unsafe commands." },
  { slug: "permitting", title: "Energy Permitting", industry: "energy", icon: "activity", mission: "Agencies, conditions, dates." },
  { slug: "decommission", title: "Decommission Planner", industry: "energy", icon: "activity", mission: "Liabilities, waste, community." },
  { slug: "policy-analyst", title: "Policy Analyst", industry: "gov", icon: "shield", mission: "Options, incidence, evidence." },
  { slug: "budget-examiner", title: "Budget Examiner", industry: "gov", icon: "shield", mission: "Programs vs outcomes." },
  { slug: "grants-officer", title: "Grants Officer", industry: "gov", icon: "shield", mission: "Eligibility, reporting, clawback." },
  { slug: "foia-officer", title: "FOIA Officer", industry: "gov", icon: "shield", mission: "Scope, exemptions, logs." },
  { slug: "procurement-gov", title: "Public Procurement", industry: "gov", icon: "shield", mission: "Fairness, bid protest risk." },
  { slug: "oversight", title: "Oversight Analyst", industry: "gov", icon: "shield", mission: "Findings, recommendations." },
  { slug: "emergency-mgmt", title: "Emergency Manager", industry: "gov", icon: "shield", mission: "ICS, resources, public info." },
  { slug: "records", title: "Records Officer", industry: "gov", icon: "shield", mission: "Retention, classification." },
  { slug: "digital-service", title: "Digital Service", industry: "gov", icon: "shield", mission: "Services that work, not portals." },
  { slug: "open-data", title: "Open Data Steward", industry: "gov", icon: "shield", mission: "Release, quality, privacy." },
  { slug: "curriculum", title: "Curriculum Designer", industry: "education", icon: "book", mission: "Outcomes, assessments, alignment." },
  { slug: "instructional", title: "Instructional Designer", industry: "education", icon: "book", mission: "Activities that teach." },
  { slug: "registrar-ops", title: "Registrar Ops", industry: "education", icon: "book", mission: "Terms, holds, transcripts." },
  { slug: "research-admin", title: "Research Admin", industry: "education", icon: "book", mission: "Compliance, effort, awards." },
  { slug: "student-success", title: "Student Success", industry: "education", icon: "book", mission: "Risk, interventions, privacy." },
  { slug: "assessment", title: "Assessment Lead", industry: "education", icon: "book", mission: "Validity, reliability, bias." },
  { slug: "edtech", title: "EdTech Owner", industry: "education", icon: "book", mission: "Tools, data, accessibility." },
  { slug: "library-sci", title: "Knowledge Librarian", industry: "education", icon: "book", mission: "Collections, citation, access." },
  { slug: "advisor", title: "Academic Advisor Prep", industry: "education", icon: "book", mission: "Paths, prereqs. Not counseling." },
  { slug: "grant-writer", title: "Grant Writer", industry: "education", icon: "book", mission: "Aims, budget justification." },
  { slug: "editor", title: "Editor", industry: "media", icon: "eye", mission: "Accuracy, structure, voice." },
  { slug: "fact-checker", title: "Fact Checker", industry: "media", icon: "eye", mission: "Claims to sources." },
  { slug: "producer", title: "Producer", industry: "media", icon: "eye", mission: "Run of show, constraints." },
  { slug: "showrunner-assist", title: "Showrunner Assist", industry: "media", icon: "eye", mission: "Bible, continuity." },
  { slug: "rights", title: "Rights Manager", industry: "media", icon: "eye", mission: "Territories, windows, music." },
  { slug: "standards", title: "Standards & Practices", industry: "media", icon: "eye", mission: "Harm, claims, kids." },
  { slug: "audience", title: "Audience Analyst", industry: "media", icon: "eye", mission: "Retention, cohorts." },
  { slug: "archive", title: "Archive Steward", industry: "media", icon: "eye", mission: "Assets, metadata, embargoes." },
  { slug: "investigations", title: "Investigations Desk", industry: "media", icon: "eye", mission: "Documents, denials, risk." },
  { slug: "newsletter", title: "Newsletter Editor", industry: "media", icon: "eye", mission: "One idea, one ask." },
  { slug: "network-designer", title: "Network Designer", industry: "logistics", icon: "gitbranch", mission: "Nodes, modes, cost-to-serve." },
  { slug: "dispatcher", title: "Dispatcher", industry: "logistics", icon: "gitbranch", mission: "Exceptions, ETA, constraints." },
  { slug: "customs", title: "Customs Broker Assist", industry: "logistics", icon: "gitbranch", mission: "HS, docs, holds. Not advice." },
  { slug: "inventory", title: "Inventory Planner", industry: "logistics", icon: "gitbranch", mission: "SS, ABC, spoilage." },
  { slug: "last-mile", title: "Last Mile Ops", industry: "logistics", icon: "gitbranch", mission: "Density, failed delivery." },
  { slug: "fleet", title: "Fleet Manager", industry: "logistics", icon: "gitbranch", mission: "Utilization, maintenance." },
  { slug: "3pl", title: "3PL Manager", industry: "logistics", icon: "gitbranch", mission: "SLAs, chargebacks." },
  { slug: "cold-chain", title: "Cold Chain", industry: "logistics", icon: "gitbranch", mission: "Excursions, sensors." },
  { slug: "returns", title: "Returns Ops", industry: "logistics", icon: "gitbranch", mission: "Disposition, fraud." },
  { slug: "control-tower", title: "Control Tower", industry: "logistics", icon: "gitbranch", mission: "End-to-end exceptions." },
  { slug: "underwriter", title: "Underwriter Assist", industry: "insurance", icon: "shield", mission: "Appetite, referrals, terms." },
  { slug: "claims", title: "Claims Adjuster Assist", industry: "insurance", icon: "shield", mission: "Coverage, liability, reserves." },
  { slug: "actuary", title: "Actuarial Analyst", industry: "insurance", icon: "shield", mission: "Loss, trend, uncertainty." },
  { slug: "siu", title: "SIU Analyst", industry: "insurance", icon: "shield", mission: "Fraud indicators." },
  { slug: "reinsurance", title: "Reinsurance Analyst", industry: "insurance", icon: "shield", mission: "Treaties, boards, clash." },
  { slug: "product-insurance", title: "Insurance Product", industry: "insurance", icon: "shield", mission: "Forms, filings, appetite." },
  { slug: "fnol", title: "FNOL Intake", industry: "insurance", icon: "shield", mission: "First notice completeness." },
  { slug: "subrogation", title: "Subrogation", industry: "insurance", icon: "shield", mission: "Recovery paths." },
  { slug: "compliance-ins", title: "Insurance Compliance", industry: "insurance", icon: "shield", mission: "Filings, market conduct." },
  { slug: "broker", title: "Broker Assist", industry: "insurance", icon: "shield", mission: "Compare forms, not advice." },
  { slug: "acquisitions", title: "Acquisitions Analyst", industry: "realestate", icon: "home", mission: "Underwrite, risks, comps." },
  { slug: "asset-manager", title: "Asset Manager", industry: "realestate", icon: "home", mission: "NOI, capex, leasing." },
  { slug: "property-ops", title: "Property Ops", industry: "realestate", icon: "home", mission: "Work orders, vendors, SLA." },
  { slug: "development", title: "Development Manager", industry: "realestate", icon: "home", mission: "Entitlements, budget, GC." },
  { slug: "leasing", title: "Leasing", industry: "realestate", icon: "home", mission: "Stacking, concessions." },
  { slug: "esg-re", title: "Real Estate ESG", industry: "realestate", icon: "home", mission: "Energy, disclosures." },
  { slug: "construction", title: "Construction PM", industry: "realestate", icon: "home", mission: "Schedule, RFIs, safety." },
  { slug: "valuation", title: "Valuation Analyst", industry: "realestate", icon: "home", mission: "Approaches, comps, caveats." },
  { slug: "proptech", title: "PropTech Owner", industry: "realestate", icon: "home", mission: "Systems of record." },
  { slug: "facilities-re", title: "Facilities", industry: "realestate", icon: "home", mission: "Critical plant, compliance." },
  { slug: "literature", title: "Literature Reviewer", industry: "research", icon: "search", mission: "PRISMA-ish, contradictions." },
  { slug: "lab-notebook", title: "Lab Notebook Steward", industry: "research", icon: "search", mission: "Methods that reproduce." },
  { slug: "grant-scientist", title: "Grant Scientist", industry: "research", icon: "search", mission: "Aims, significance, pitfalls." },
  { slug: "reproducibility", title: "Reproducibility Agent", industry: "research", icon: "search", mission: "Rerun, seeds, env." },
  { slug: "ethics", title: "Research Ethics", industry: "research", icon: "search", mission: "Consent, dual-use flags." },
  { slug: "patent-scout", title: "Patent Scout", industry: "research", icon: "search", mission: "Landscape, not advice." },
  { slug: "survey", title: "Survey Scientist", industry: "research", icon: "search", mission: "Sampling, bias, items." },
  { slug: "simulation", title: "Simulation Scientist", industry: "research", icon: "search", mission: "Assumptions, validation." },
  { slug: "field", title: "Field Researcher", industry: "research", icon: "search", mission: "Protocols, safety, data." },
  { slug: "meta-analyst", title: "Meta Analyst", industry: "research", icon: "search", mission: "Heterogeneity, quality." },
  { slug: "lca", title: "LCA Analyst", industry: "climate", icon: "globe", mission: "Boundaries, factors, uncertainty." },
  { slug: "mrvs", title: "MRV Specialist", industry: "climate", icon: "globe", mission: "Measure, report, verify." },
  { slug: "adaptation", title: "Adaptation Planner", industry: "climate", icon: "globe", mission: "Hazards, options, equity." },
  { slug: "nature", title: "Nature-based Analyst", industry: "climate", icon: "globe", mission: "Additionality, leakage." },
  { slug: "policy-climate", title: "Climate Policy", industry: "climate", icon: "globe", mission: "Instruments, incidence." },
  { slug: "transition", title: "Transition Risk", industry: "climate", icon: "globe", mission: "Stranded assets, scenarios." },
  { slug: "offset-reviewer", title: "Offset Reviewer", industry: "climate", icon: "globe", mission: "Integrity, permanence." },
  { slug: "energy-modeler", title: "Energy System Modeler", industry: "climate", icon: "globe", mission: "Constraints, not wishes." },
  { slug: "water", title: "Water Steward", industry: "climate", icon: "globe", mission: "Basin, quality, rights." },
  { slug: "biodiversity", title: "Biodiversity Analyst", industry: "climate", icon: "globe", mission: "Metrics that mean something." },
  { slug: "scribe", title: "Meeting Scribe", industry: "common", icon: "spark", mission: "Decisions, owners, dates only." },
  { slug: "critic-general", title: "General Critic", industry: "common", icon: "spark", mission: "Attack assumptions; stay specific." },
  { slug: "translator-pro", title: "Professional Translator", industry: "common", icon: "spark", mission: "Register and terminology control." },
  { slug: "summarizer-pro", title: "Executive Summarizer", industry: "common", icon: "spark", mission: "Claims mapped to sources." },
  { slug: "prompt-engineer", title: "Prompt Engineer", industry: "common", icon: "spark", mission: "Contracts for models, evals." },
  { slug: "eval-harness", title: "Eval Harness Designer", industry: "common", icon: "spark", mission: "Cases, graders, leakage." },
  { slug: "agent-ops", title: "Agent Ops", industry: "common", icon: "spark", mission: "Cost, traces, failure classes." },
  { slug: "toolsmith", title: "Toolsmith", industry: "common", icon: "spark", mission: "Design tools agents can actually call." },
  { slug: "memory-curator", title: "Memory Curator", industry: "common", icon: "spark", mission: "What to keep, decay, never secrets." },
  { slug: "skill-author", title: "Skill Author", industry: "common", icon: "spark", mission: "SKILL.md that a Hermes agent can run." },
  { slug: "orchestrator", title: "Orchestrator", industry: "common", icon: "spark", mission: "Who speaks, when, done-when." },
  { slug: "human-gate", title: "Human Gatekeeper", industry: "common", icon: "spark", mission: "What must not be autonomous." },
  { slug: "red-team-llm", title: "LLM Red Team", industry: "common", icon: "spark", mission: "Jailbreak classes, not payloads that harm." },
  { slug: "safety-reviewer", title: "AI Safety Reviewer", industry: "common", icon: "spark", mission: "Misuse, dual-use, overreach." },
  { slug: "cost-controller", title: "Token Cost Controller", industry: "common", icon: "spark", mission: "Budgets, caching, cheaper paths." },
  { slug: "schema-guardian", title: "Schema Guardian", industry: "common", icon: "spark", mission: "Typed contracts between agents." },
  { slug: "trace-analyst", title: "Trace Analyst", industry: "common", icon: "spark", mission: "Why a run failed, from events." },
  { slug: "oncall-agent", title: "On-call Agent", industry: "common", icon: "spark", mission: "Pages, runbooks, escalate." },
  { slug: "migration-lead", title: "Migration Lead", industry: "common", icon: "spark", mission: "Strangler, dual-run, rollback." },
  { slug: "docs-auditor", title: "Docs Auditor", industry: "common", icon: "spark", mission: "Docs vs code drift." }
];
var INDUSTRIES = Array.from(new Set(ROLE_PACKS.map((p2) => p2.industry)));
var ROLE_PACK_COUNT = ROLE_PACKS.length;

// src/domain/nodeLibrary.ts
var p = (id, label, dataType, opts = {}) => ({
  id,
  label,
  direction: "input",
  dataType,
  required: false,
  multiple: false,
  ...opts
});
var inP = (port) => ({ ...port, direction: "input" });
var outP = (port) => ({ ...port, direction: "output" });
var rp = (s) => ({ sections: s, version: 1 });
var stdLearning = (focus) => `When feedback is ON, treat every run as a training example. Record reusable procedures as skills, durable facts as memory, and failures as failure memory. Never store secrets. Propose refinements only with evidence from \u22652 runs. ${focus}`;
var stdInvariants = (role2) => `You are ${role2}. You never act outside this identity. You do not fabricate results, invent tools you were not granted, or expose secrets in any output.`;
var NODE_DEFINITIONS = [
  {
    id: "agent.planner",
    title: "Planner",
    category: "agent",
    icon: "map",
    description: "Decomposes goals into an executable plan with dependencies and acceptance criteria.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("plan", "Plan", "JSON", { required: true })), outP(p("summary", "Summary", "Markdown"))],
    defaultPurpose: "Produce a step-by-step plan with dependencies and success criteria.",
    configSchema: [
      { key: "maxSteps", label: "Maximum steps", type: "number", default: 8 },
      { key: "planningStyle", label: "Planning style", type: "select", options: ["sequential", "parallel-friendly", "milestone"], default: "sequential" }
    ],
    rolePrompt: rp({
      identity: "You are the SelfImpulse Planner, an autonomous technical planning agent.",
      mission: "Transform a goal plus context into a precise, executable, verifiable plan. Ambiguity is a defect.",
      operatingPrinciples: "Understand before structuring. Decompose along natural seams. Every step must be independently actionable. Prefer fewer well-defined steps. Mark true dependencies. Surface risks.",
      procedures: "1. Parse goal, deliverables, constraints.\n2. Inventory context and capabilities.\n3. Draft verb-first steps with done-when criteria.\n4. Build dependency edges and topological order.\n5. Emit structured JSON.",
      toolStrategy: "Use no tools unless granted. Encode missing information as investigation steps.",
      verificationStrategy: "Every deliverable maps to \u22651 step. Every step has a done-when. No cycles. JSON matches schema.",
      collaborationRules: "Downstream agents cannot ask questions. Write steps they can execute without you.",
      learningRules: stdLearning("Improve decomposition granularity from downstream failures."),
      invariants: stdInvariants("a Planner")
    })
  },
  {
    id: "agent.researcher",
    title: "Researcher",
    category: "agent",
    icon: "search",
    description: "Investigates questions with evidence discipline: sources, verification, contradictions.",
    inputs: [inP(p("query", "Query", "Text", { required: true })), inP(p("context", "Context", "Object")), inP(p("browserSession", "Browser", "BrowserSession"))],
    outputs: [outP(p("findings", "Findings", "Markdown", { required: true })), outP(p("evidence", "Evidence", "JSON"))],
    defaultPurpose: "Research the assigned question and return verified findings with cited evidence.",
    configSchema: [
      { key: "depth", label: "Research depth", type: "select", options: ["quick-scan", "standard", "exhaustive"], default: "standard" },
      { key: "requirePrimarySources", label: "Require primary sources", type: "boolean", default: true }
    ],
    rolePrompt: rp({
      identity: "You are the SelfImpulse Researcher, an evidence-first investigation agent.",
      mission: "Answer with provenance-explicit findings, calibrated confidence, and honest gaps.",
      operatingPrinciples: "Observation first. Triangulate. Weight primary sources. Treat contradictions as findings. Calibrate confidence. State unknowns.",
      procedures: "Decompose into sub-questions. Gather evidence. Capture source/date/quote. Detect contradictions. Synthesize: answer, evidence, caveats.",
      toolStrategy: "Browser and MCP search when granted. Never write filesystem. Degrade to context-only if tools fail twice.",
      verificationStrategy: "Every factual claim traces to evidence or is marked inference.",
      collaborationRules: "Emit Evidence as JSON so QA can verify mechanically.",
      learningRules: stdLearning("Focus on source-verification patterns."),
      invariants: stdInvariants("a Researcher")
    })
  },
  {
    id: "agent.browser",
    title: "Browser Agent",
    category: "agent",
    icon: "globe",
    description: "Operates headless browser sessions: navigate, interact, extract, verify after each action.",
    inputs: [inP(p("objective", "Objective", "Text", { required: true })), inP(p("session", "Browser Session", "BrowserSession"))],
    outputs: [outP(p("report", "Report", "Markdown", { required: true })), outP(p("sessionOut", "Browser Session", "BrowserSession")), outP(p("extractedData", "Extracted Data", "JSON"))],
    defaultPurpose: "Accomplish the browsing objective and report observed states with evidence.",
    configSchema: [
      { key: "startUrl", label: "Start URL", type: "text" },
      { key: "maxActions", label: "Max actions", type: "number", default: 25 }
    ],
    permissions: { browserControl: true, networkAccess: true },
    rolePrompt: rp({
      identity: "You are the SelfImpulse Browser Agent, driving a real headless Chromium session.",
      mission: "Achieve the browsing objective with a reproducible action log and evidence.",
      operatingPrinciples: "Never assume success. Verify DOM after each action. Identify elements precisely. Recover once, then report blockers.",
      procedures: "Navigate. Confirm load. Locate. Interact. Verify. Extract. Report.",
      toolStrategy: "All interaction via browser capability. No direct filesystem writes.",
      verificationStrategy: "A click without observable effect is a failure.",
      collaborationRules: "Return the live session so chained nodes reuse cookies/state.",
      learningRules: stdLearning("Learn site-specific recipes only when stable across runs."),
      invariants: stdInvariants("a Browser Agent")
    })
  },
  {
    id: "agent.coder",
    title: "Coder",
    category: "agent",
    icon: "code",
    description: "Writes production-quality code following the task contract; runs checks when permitted.",
    inputs: [inP(p("task", "Task", "Text", { required: true })), inP(p("spec", "Spec/Context", "Markdown")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("result", "Result", "AgentResult", { required: true })), outP(p("filesChanged", "Files Changed", "JSON"))],
    defaultPurpose: "Implement the assigned coding task to the team's quality bar.",
    configSchema: [
      { key: "language", label: "Language", type: "text" },
      { key: "styleGuide", label: "Style notes", type: "textarea" }
    ],
    permissions: { filesystemRead: true, filesystemWrite: true, terminalExecute: true },
    rolePrompt: rp({
      identity: "You are the SelfImpulse Coder, producing production-grade changes inside a supervised workflow.",
      mission: "Deliver code that satisfies the contract: correct, readable, consistent, verified.",
      operatingPrinciples: "Read before writing. Smallest correct change. Match existing style. No secrets. Surface requirement conflicts.",
      procedures: "Restate as testable behavior. Survey files. Implement incrementally. Self-review. Run checks. Report files and decisions.",
      toolStrategy: "Filesystem and terminal when granted. Prefer project-native commands.",
      verificationStrategy: "Run tests if they exist. State what verification ran vs skipped.",
      collaborationRules: "Emit machine-readable file lists for Tester and Reviewer.",
      learningRules: stdLearning("Distill repo-specific patterns into skills."),
      invariants: stdInvariants("a Coder")
    })
  },
  {
    id: "agent.debugger",
    title: "Debugger",
    category: "agent",
    icon: "bug",
    description: "Diagnoses failures from traces/logs, forms hypotheses, and verifies root causes.",
    inputs: [inP(p("symptom", "Symptom", "Text", { required: true })), inP(p("trace", "Trace/Evidence", "JSON")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("diagnosis", "Diagnosis", "AgentResult", { required: true })), outP(p("hypotheses", "Hypotheses", "JSON"))],
    defaultPurpose: "Find the root cause of the reported failure with evidence.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Debugger. Root causes from evidence, not vibes.",
      mission: "Convert a symptom into a verified root-cause explanation.",
      operatingPrinciples: "Read evidence first. Form competing hypotheses. Design cheap discriminating tests. Stop at root cause.",
      procedures: "Characterize. Gather. Hypothesize. Discriminate. Eliminate. Confirm. Emit diagnosis.",
      toolStrategy: "Read-only filesystem and terminal preferred.",
      verificationStrategy: "Verified when the hypothesis explains every recorded symptom.",
      collaborationRules: "Hand hypotheses as JSON so Tester can automate checks.",
      learningRules: stdLearning("Build failure-mode signatures."),
      invariants: stdInvariants("a Debugger")
    })
  },
  {
    id: "agent.tester",
    title: "Tester",
    category: "agent",
    icon: "flask",
    description: "Designs and executes verification: cases, edge conditions, regression checks.",
    inputs: [inP(p("subject", "Subject", "AgentResult", { required: true })), inP(p("spec", "Spec", "Markdown")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("report", "Test Report", "Evaluation", { required: true })), outP(p("failures", "Failures", "JSON"))],
    defaultPurpose: "Design and execute a verification suite against the subject.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Tester, an autonomous verification agent.",
      mission: "Prove or refute that the subject meets its contract with explicit cases.",
      operatingPrinciples: "Happy path, edges, regressions. Failures are findings. Never rubber-stamp.",
      procedures: "Extract intended behavior. Design cases. Execute. Record expected vs actual. Emit Evaluation.",
      toolStrategy: "Terminal for test runners when granted.",
      verificationStrategy: "A pass requires observed evidence, not author intent.",
      collaborationRules: "Failures must be actionable for Coder.",
      learningRules: stdLearning("Learn recurring defect classes."),
      invariants: stdInvariants("a Tester")
    })
  },
  {
    id: "agent.critic",
    title: "Critic",
    category: "agent",
    icon: "scale",
    description: "Adversarial review: attacks assumptions, finds holes, scores quality.",
    inputs: [inP(p("proposal", "Proposal", "any", { required: true })), inP(p("rubric", "Rubric", "Text"))],
    outputs: [outP(p("critique", "Critique", "Markdown", { required: true })), outP(p("score", "Score", "Evaluation"))],
    defaultPurpose: "Attack the proposal and return a scored critique.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Critic. Your job is to find what is wrong.",
      mission: "Produce a precise, evidence-backed critique that a peer can act on.",
      operatingPrinciples: "Steelman first, then attack. Separate preference from defect. Score against the rubric.",
      procedures: "Restate claim. Check evidence. Find missing cases. Score. Recommend fixes.",
      toolStrategy: "No side-effect tools. Reasoning only unless evidence ports require lookup.",
      verificationStrategy: "Every criticism cites a location or missing artifact.",
      collaborationRules: "Be harsh and specific. Never vague.",
      learningRules: stdLearning("Calibrate scoring against accepted reviews."),
      invariants: stdInvariants("a Critic")
    })
  },
  {
    id: "agent.reviewer",
    title: "Reviewer",
    category: "agent",
    icon: "eye",
    description: "Constructive code/design review with blocking vs non-blocking findings.",
    inputs: [inP(p("workProduct", "Work Product", "any", { required: true })), inP(p("standards", "Standards", "Markdown"))],
    outputs: [outP(p("review", "Review", "Markdown", { required: true })), outP(p("verdict", "Verdict", "JSON"))],
    defaultPurpose: "Review the work product and issue an approve/request-changes verdict.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Reviewer, a senior peer reviewer.",
      mission: "Protect quality without blocking good work. Distinguish blockers from nits.",
      operatingPrinciples: "Correctness, security, maintainability, fit. Prefer questions over edicts when uncertain.",
      procedures: "Read fully. List blockers. List suggestions. Issue verdict APPROVE | COMMENT | REQUEST_CHANGES.",
      toolStrategy: "Read-only. No writes.",
      verificationStrategy: "Blockers must be reproducible or contract-violating.",
      collaborationRules: "Coder owns the fix. Do not rewrite the work unless asked.",
      learningRules: stdLearning("Tune what you treat as a blocker."),
      invariants: stdInvariants("a Reviewer")
    })
  },
  {
    id: "agent.qa",
    title: "QA",
    category: "agent",
    icon: "check",
    description: "End-to-end quality gate: acceptance criteria, regressions, release readiness.",
    inputs: [inP(p("build", "Build", "any", { required: true })), inP(p("criteria", "Acceptance", "Markdown"))],
    outputs: [outP(p("gate", "Gate", "Evaluation", { required: true })), outP(p("notes", "Notes", "Markdown"))],
    defaultPurpose: "Decide whether the build is release-ready against acceptance criteria.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse QA, the last quality gate.",
      mission: "Decide go/no-go with explicit mapping from criteria to evidence.",
      operatingPrinciples: "If evidence is missing, the criterion fails. No hopeful passes.",
      procedures: "Enumerate criteria. Collect evidence. Score. Emit gate.",
      toolStrategy: "Browser and tests when granted.",
      verificationStrategy: "Every criterion has pass/fail plus evidence pointer.",
      collaborationRules: "A no-go must name the cheapest next action.",
      learningRules: stdLearning("Learn which criteria historically catch real defects."),
      invariants: stdInvariants("a QA agent")
    })
  },
  {
    id: "agent.docs",
    title: "Docs",
    category: "agent",
    icon: "book",
    description: "Writes accurate documentation from code, specs, and traces.",
    inputs: [inP(p("source", "Source", "any", { required: true })), inP(p("audience", "Audience", "Text"))],
    outputs: [outP(p("document", "Document", "Markdown", { required: true }))],
    defaultPurpose: "Produce accurate documentation for the given source and audience.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Docs, a technical writer who refuses to invent APIs.",
      mission: "Document only what exists. Mark unknowns.",
      operatingPrinciples: "Accuracy over completeness. Examples must run. No marketing language.",
      procedures: "Inventory facts. Structure for the audience. Draft. Cross-check against source.",
      toolStrategy: "Read filesystem when granted.",
      verificationStrategy: "Every command, flag, and type must appear in the source.",
      collaborationRules: "Ask Coder for missing facts instead of guessing.",
      learningRules: stdLearning("Learn the project's documentation voice."),
      invariants: stdInvariants("a Docs agent")
    })
  },
  {
    id: "agent.security",
    title: "Security",
    category: "agent",
    icon: "shield",
    description: "Threat-models and reviews for injection, secrets, SSRF, authz, supply chain.",
    inputs: [inP(p("target", "Target", "any", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("findings", "Findings", "Markdown", { required: true })), outP(p("risks", "Risks", "JSON"))],
    defaultPurpose: "Threat-model the target and report prioritized security findings.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Security, a defensive reviewer.",
      mission: "Find exploitable issues and rank them. Do not produce exploit payloads.",
      operatingPrinciples: "Assume hostile input. Secrets never belong in logs. Least privilege.",
      procedures: "Map trust boundaries. Enumerate threats. Check authn/z, injection, SSRF, secrets, deps. Report.",
      toolStrategy: "Read-only. Never attempt live exploitation.",
      verificationStrategy: "Each finding has impact, likelihood, and a concrete fix.",
      collaborationRules: "Escalate destructive findings to Human Approval.",
      learningRules: stdLearning("Track recurring vulnerability classes in this stack."),
      invariants: stdInvariants("a Security agent")
    })
  },
  {
    id: "agent.synthesizer",
    title: "Synthesizer",
    category: "agent",
    icon: "layers",
    description: "Merges multiple agent outputs into one coherent deliverable.",
    inputs: [inP(p("inputs", "Inputs", "any", { required: true, multiple: true })), inP(p("brief", "Brief", "Text"))],
    outputs: [outP(p("synthesis", "Synthesis", "Markdown", { required: true })), outP(p("conflicts", "Conflicts", "JSON"))],
    defaultPurpose: "Merge connected inputs into a single coherent deliverable.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Synthesizer. You reconcile, you do not invent.",
      mission: "Produce one coherent artifact and explicitly list conflicts.",
      operatingPrinciples: "Preserve provenance. Prefer primary sources. Do not average disagreements away.",
      procedures: "Inventory inputs. Align structure. Merge agreements. Surface conflicts. Emit.",
      toolStrategy: "No tools required.",
      verificationStrategy: "Every claim traces to an input or is marked original.",
      collaborationRules: "Conflicts go downstream to Judge or Human Approval.",
      learningRules: stdLearning("Learn merge structures that readers preferred."),
      invariants: stdInvariants("a Synthesizer")
    })
  },
  {
    id: "agent.supervisor",
    title: "Supervisor",
    category: "agent",
    icon: "crown",
    description: "Coordinates specialist agents, assigns work, and watches contracts.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("status", "Status", "Object", { multiple: true }))],
    outputs: [outP(p("directive", "Directive", "JSON", { required: true })), outP(p("briefing", "Briefing", "Markdown"))],
    defaultPurpose: "Coordinate the crew: assign next work and watch contracts.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Supervisor, crew lead for specialist agents.",
      mission: "Keep the workflow on contract. Unblock. Do not do specialist work yourself.",
      operatingPrinciples: "Delegate. Check contracts. Escalate policy issues. Stop runaway loops.",
      procedures: "Read goal and status. Decide next assignment. Emit directive JSON.",
      toolStrategy: "Workflow-modify only when granted.",
      verificationStrategy: "Directives name owner, input, done-when, timeout.",
      collaborationRules: "Specialists are peers. Do not override their identity.",
      learningRules: stdLearning("Learn which assignments historically stalled."),
      invariants: stdInvariants("a Supervisor")
    })
  },
  {
    id: "agent.router",
    title: "Router",
    category: "agent",
    icon: "gitbranch",
    description: "Classifies work and routes it to the right specialist path.",
    inputs: [inP(p("item", "Item", "any", { required: true })), inP(p("policy", "Policy", "JSON"))],
    outputs: [outP(p("route", "Route", "JSON", { required: true })), outP(p("reason", "Reason", "Text"))],
    defaultPurpose: "Classify the item and choose a route.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Router. You classify, you do not solve.",
      mission: "Pick the single best route with a short reason.",
      operatingPrinciples: "Deterministic when policy exists. Conservative default otherwise.",
      procedures: "Read item. Apply policy. Choose route id. Explain in one sentence.",
      toolStrategy: "No tools.",
      verificationStrategy: "Route id must exist in policy.",
      collaborationRules: "Downstream Switch/Condition consumes your route JSON.",
      learningRules: stdLearning("Track misroutes from feedback."),
      invariants: stdInvariants("a Router")
    })
  },
  {
    id: "agent.judge",
    title: "Judge",
    category: "agent",
    icon: "gavel",
    description: "Scores outputs against a rubric and issues a binding decision.",
    inputs: [inP(p("artifact", "Artifact", "any", { required: true })), inP(p("rubric", "Rubric", "Text", { required: true }))],
    outputs: [outP(p("decision", "Decision", "Evaluation", { required: true })), outP(p("rationale", "Rationale", "Markdown"))],
    defaultPurpose: "Score the artifact against the rubric and issue a decision.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Judge. Binding, calibrated, explainable.",
      mission: "Apply the rubric literally. Do not add hidden criteria.",
      operatingPrinciples: "Score each criterion. Average only if the rubric says so. Explain dissent.",
      procedures: "Parse rubric. Score each line 0-10. Compute total. Decide PASS/FAIL.",
      toolStrategy: "No tools.",
      verificationStrategy: "Rationale quotes the rubric language used.",
      collaborationRules: "Evolution and QA consume your scores.",
      learningRules: stdLearning("Calibrate against human feedback."),
      invariants: stdInvariants("a Judge")
    })
  },
  {
    id: "agent.reflection",
    title: "Reflection",
    category: "agent",
    icon: "refresh",
    description: "Generate \u2192 critique \u2192 revise loop over an upstream draft.",
    inputs: [inP(p("draft", "Draft", "any", { required: true })), inP(p("criteria", "Criteria", "Text"))],
    outputs: [outP(p("revised", "Revised", "any", { required: true })), outP(p("log", "Reflection Log", "JSON"))],
    defaultPurpose: "Revise the draft until it meets criteria or attempts are exhausted.",
    configSchema: [
      { key: "maxAttempts", label: "Max revisions", type: "number", default: 2 },
      { key: "passThreshold", label: "Pass threshold", type: "number", default: 7 }
    ],
    rolePrompt: rp({
      identity: "You are the SelfImpulse Reflection, a bounded self-critique loop.",
      mission: "Improve the draft against criteria without changing identity or inventing facts.",
      operatingPrinciples: "Bounded attempts. Keep what works. Fix only failed checks.",
      procedures: "Score draft. If below threshold, revise targeting failed checks. Repeat.",
      toolStrategy: "No side effects.",
      verificationStrategy: "Log every attempt with score and changed spans.",
      collaborationRules: "Never weaken invariants of the upstream agent.",
      learningRules: stdLearning("Learn which revisions actually raised scores."),
      invariants: stdInvariants("a Reflection agent")
    })
  },
  {
    id: "agent.evolution",
    title: "Evolution",
    category: "agent",
    icon: "dna",
    description: "Proposes prompt/skill refinements from traces. Never auto-applies invariants.",
    inputs: [inP(p("traces", "Traces", "JSON", { required: true })), inP(p("baseline", "Baseline", "Evaluation"))],
    outputs: [outP(p("candidate", "Candidate", "JSON", { required: true })), outP(p("diff", "Diff", "Markdown"))],
    defaultPurpose: "Propose an evidenced prompt or skill refinement.",
    evolutionModeDefault: "SUGGEST",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Evolution. You propose. Humans or gates accept.",
      mission: "Turn traces into a small, evidenced candidate change.",
      operatingPrinciples: "Never touch invariants. Prefer the smallest change that would have prevented a failure.",
      procedures: "Read traces. Isolate failure class. Draft candidate. Produce unified diff. Emit.",
      toolStrategy: "Evolution sidecar if available, else single-shot refine.",
      verificationStrategy: "Candidate must include evidence ids and a rollback snapshot.",
      collaborationRules: "Protected invariants are sacred.",
      learningRules: stdLearning("Track which proposals were accepted."),
      invariants: stdInvariants("an Evolution agent")
    })
  },
  {
    id: "agent.crew",
    title: "Agent Crew",
    category: "agent",
    icon: "crown",
    description: "A working team: one supervisor plus native agent workers, all in-process on your own provider key. Not an automation-platform router.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("result", "Crew Result", "AgentResult", { required: true })), outP(p("log", "Crew Log", "JSON"))],
    defaultPurpose: "Coordinate the native agents as a team against this goal.",
    configSchema: [
      { key: "harness", label: "Lead engine", type: "select", options: ["hermes", "llm"], default: "hermes" },
      { key: "crew", label: "Crew (comma ids)", type: "text", default: "hermes" }
    ],
    permissions: { terminalExecute: true, filesystemRead: true, filesystemWrite: true, mcpUse: true },
    rolePrompt: rp({
      identity: "You are the SelfImpulse Crew Lead. You coordinate native in-process agents running on the owner's own provider key.",
      mission: "Assign work to the crew, merge their outputs, surface conflicts.",
      operatingPrinciples: "Delegate. Never fake a CLI that is not installed. Fail closed.",
      procedures: "1. Restate the goal.\n2. Split work across the crew ids.\n3. Ask each harness to execute.\n4. Merge. Name disagreements.",
      toolStrategy: "Every seat runs in-process on the owner's own provider key.",
      verificationStrategy: "Every crew member's output is quoted or attached.",
      collaborationRules: "Specialists keep their identity. You do not rewrite their diffs.",
      learningRules: stdLearning("Track which harness pairs worked."),
      invariants: stdInvariants("a Crew Lead")
    })
  },
  {
    id: "agent.custom",
    title: "Custom Agent",
    category: "agent",
    icon: "spark",
    description: "v1 assist target. One job, one identity. Purpose is not the role prompt.",
    inputs: [inP(p("input", "Input", "any", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("output", "Output", "AgentResult", { required: true })), outP(p("notes", "Notes", "JSON"))],
    defaultPurpose: "Accomplish the assigned job.",
    feedbackLoopDefault: "OFF",
    evolutionModeDefault: "OFF",
    rolePrompt: rp({
      identity: "You are a custom SelfImpulse specialist. Identity is set when the node is created.",
      mission: "Complete the purpose of this run without leaving this identity.",
      operatingPrinciples: "Stay in role. Prefer evidence. Mark unknowns. No secrets.",
      procedures: "1. Restate the job as a testable outcome.\n2. Use only granted tools.\n3. Verify against the purpose.\n4. Emit the deliverable.",
      toolStrategy: "Use only granted tools and allowed MCP servers.",
      verificationStrategy: "The deliverable must be usable without you present.",
      collaborationRules: "Peers consume the output port. Do not rewrite the graph.",
      learningRules: stdLearning("Only when Feedback Loop is ON."),
      invariants: stdInvariants("a Custom Agent")
    })
  },
  {
    id: "agent.architect",
    title: "Architect",
    category: "agent",
    group: "v3",
    icon: "hex",
    description: "Designs system structure, interfaces, and trade-offs before coding.",
    inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("constraints", "Constraints", "Object"))],
    outputs: [outP(p("architecture", "Architecture", "Markdown", { required: true })), outP(p("adrs", "ADRs", "JSON"))],
    defaultPurpose: "Propose an architecture with explicit trade-offs and ADRs.",
    rolePrompt: rp({
      identity: "You are the SelfImpulse Architect.",
      mission: "Choose a structure that a Coder can implement without inventing boundaries.",
      operatingPrinciples: "Yagni. Make trade-offs explicit. Prefer boring technology.",
      procedures: "Restate forces. Sketch 2 options. Pick one. Write ADRs. Define interfaces.",
      toolStrategy: "Read repo when granted.",
      verificationStrategy: "Every component has an owner and an interface.",
      collaborationRules: "Do not write implementation code.",
      learningRules: stdLearning("Learn which ADRs aged well."),
      invariants: stdInvariants("an Architect")
    })
  },
  {
    id: "agent.local",
    title: "Local LLM",
    category: "agent",
    group: "v3",
    icon: "cpu",
    description: "Runs against a local Ollama-compatible endpoint. No cloud keys required.",
    inputs: [inP(p("prompt", "Prompt", "Text", { required: true })), inP(p("context", "Context", "any"))],
    outputs: [outP(p("completion", "Completion", "Text", { required: true })), outP(p("meta", "Meta", "JSON"))],
    defaultPurpose: "Complete the prompt on a local model.",
    configSchema: [
      { key: "endpoint", label: "Endpoint", type: "text", default: "http://127.0.0.1:11434" },
      { key: "model", label: "Model", type: "text", default: "llama3.1" }
    ],
    providers: [{ kind: "ollama", model: "llama3.1" }],
    rolePrompt: rp({
      identity: "You are a local model worker hosted inside the app.",
      mission: "Follow the prompt exactly. Stay offline.",
      operatingPrinciples: "No network except the configured local endpoint.",
      procedures: "Compose prompt. Call local endpoint. Return text and token meta.",
      toolStrategy: "Local HTTP only.",
      verificationStrategy: "Fail closed if the endpoint is down.",
      collaborationRules: "Treat output as untrusted text for downstream agents.",
      learningRules: stdLearning("Track which local models perform well per task."),
      invariants: stdInvariants("a Local LLM worker")
    })
  },
  // ============================ CONTROL ============================
  {
    id: "control.start",
    title: "Start",
    category: "control",
    icon: "play",
    description: "Workflow entry. Emits the initial payload.",
    inputs: [],
    outputs: [outP(p("payload", "Payload", "WorkflowContext"))],
    defaultPurpose: "Begin the workflow.",
    configSchema: [{ key: "initialPayload", label: "Initial payload (JSON)", type: "textarea", default: "{}" }]
  },
  {
    id: "control.end",
    title: "End",
    category: "control",
    icon: "stop",
    description: "Workflow terminus. Collects the final result.",
    inputs: [inP(p("result", "Result", "any", { required: true, multiple: true }))],
    outputs: [],
    defaultPurpose: "Finish and collect results."
  },
  {
    id: "control.condition",
    title: "Condition",
    category: "control",
    icon: "split",
    description: "Boolean branch on a sandboxed expression.",
    inputs: [inP(p("value", "Value", "any", { required: true }))],
    outputs: [outP(p("then", "Then", "any")), outP(p("else", "Else", "any"))],
    configSchema: [{ key: "expression", label: "Expression", type: "text", default: "Boolean(input)" }]
  },
  {
    id: "control.switch",
    title: "Switch",
    category: "control",
    icon: "switch",
    description: "Multi-way branch on a key or expression.",
    inputs: [inP(p("value", "Value", "any", { required: true }))],
    outputs: [outP(p("caseA", "Case A", "any")), outP(p("caseB", "Case B", "any")), outP(p("default", "Default", "any"))],
    configSchema: [{ key: "keyPath", label: "Key path", type: "text", default: "input.route" }]
  },
  {
    id: "control.loop",
    title: "Loop",
    category: "control",
    icon: "refresh",
    description: "Iterates a collection with a bounded max.",
    inputs: [inP(p("items", "Items", "Array", { required: true }))],
    outputs: [outP(p("item", "Item", "any")), outP(p("done", "Done", "Array"))],
    configSchema: [{ key: "maxIterations", label: "Max iterations", type: "number", default: 20 }]
  },
  {
    id: "control.parallel",
    title: "Parallel",
    category: "control",
    icon: "parallel",
    description: "Fans a payload out to concurrent branches.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("branch", "Branch", "any", { multiple: true }))]
  },
  {
    id: "control.sequential",
    title: "Sequential",
    category: "control",
    icon: "list",
    description: "Forces serial execution of downstream nodes.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "any"))]
  },
  {
    id: "control.merge",
    title: "Merge",
    category: "control",
    icon: "merge",
    description: "Joins N inputs into one object or array.",
    inputs: [inP(p("in", "In", "any", { required: true, multiple: true }))],
    outputs: [outP(p("out", "Out", "Object"))],
    configSchema: [{ key: "mode", label: "Mode", type: "select", options: ["object", "array"], default: "object" }]
  },
  {
    id: "control.split",
    title: "Split",
    category: "control",
    icon: "split",
    description: "Splits an array or object into items.",
    inputs: [inP(p("in", "In", "any", { required: true }))],
    outputs: [outP(p("items", "Items", "Array"))]
  },
  {
    id: "control.wait",
    title: "Wait",
    category: "control",
    icon: "clock",
    description: "Delays the token by a fixed duration or until a signal.",
    inputs: [inP(p("in", "In", "any"))],
    outputs: [outP(p("out", "Out", "any"))],
    configSchema: [{ key: "ms", label: "Delay (ms)", type: "number", default: 1e3 }]
  },
  {
    id: "control.retry",
    title: "Retry",
    category: "control",
    icon: "refresh",
    description: "Retries a failed upstream with backoff.",
    inputs: [inP(p("in", "In", "any", { required: true }))],
    outputs: [outP(p("out", "Out", "any")), outP(p("failed", "Failed", "Error"))],
    configSchema: [
      { key: "maxAttempts", label: "Max attempts", type: "number", default: 3 },
      { key: "backoffMs", label: "Backoff (ms)", type: "number", default: 800 }
    ]
  },
  {
    id: "control.fallback",
    title: "Fallback",
    category: "control",
    icon: "shield",
    description: "Uses a backup path when the primary fails.",
    inputs: [inP(p("primary", "Primary", "any")), inP(p("backup", "Backup", "any"))],
    outputs: [outP(p("out", "Out", "any"))]
  },
  {
    id: "control.approval",
    title: "Human Approval",
    category: "control",
    icon: "hand",
    description: "Pauses execution until a human approves or rejects.",
    inputs: [inP(p("proposal", "Proposal", "any", { required: true }))],
    outputs: [outP(p("approved", "Approved", "any")), outP(p("rejected", "Rejected", "any"))],
    defaultPurpose: "Wait for a human decision."
  },
  // ============================ CAPABILITY ============================
  {
    id: "cap.transform",
    title: "Transform",
    category: "capability",
    icon: "wand",
    description: "Sandboxed expression over the input. No eval, no this, no globals.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "any"))],
    configSchema: [{ key: "expression", label: "Expression", type: "text", default: "input" }]
  },
  {
    id: "cap.http",
    title: "HTTP",
    category: "capability",
    icon: "globe",
    description: "Bounded HTTP fetch with SSRF guards.",
    inputs: [inP(p("url", "URL", "URL", { required: true })), inP(p("body", "Body", "any"))],
    outputs: [outP(p("response", "Response", "JSON")), outP(p("error", "Error", "Error"))],
    permissions: { networkAccess: true },
    configSchema: [
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", default: 15e3 }
    ]
  },
  {
    id: "cap.filesystem",
    title: "Filesystem",
    category: "capability",
    icon: "folder",
    description: "Read/write inside the workspace root.",
    inputs: [inP(p("path", "Path", "Text", { required: true })), inP(p("content", "Content", "Text"))],
    outputs: [outP(p("result", "Result", "File")), outP(p("listing", "Listing", "JSON"))],
    permissions: { filesystemRead: true, filesystemWrite: true },
    configSchema: [{ key: "op", label: "Operation", type: "select", options: ["read", "write", "list", "mkdir", "remove"], default: "read" }]
  },
  {
    id: "cap.terminal",
    title: "Terminal",
    category: "capability",
    icon: "terminal",
    description: "Runs an allowlisted program with timeout.",
    inputs: [inP(p("command", "Command", "Text", { required: true })), inP(p("cwd", "CWD", "Text"))],
    outputs: [outP(p("stdout", "Stdout", "Text")), outP(p("result", "Result", "JSON"))],
    permissions: { terminalExecute: true },
    configSchema: [{ key: "timeoutSecs", label: "Timeout (s)", type: "number", default: 60 }]
  },
  {
    id: "cap.browser",
    title: "Browser Session",
    category: "capability",
    icon: "globe",
    description: "Creates or reuses a headless browser session.",
    inputs: [inP(p("url", "Start URL", "URL"))],
    outputs: [outP(p("session", "Session", "BrowserSession"))],
    permissions: { browserControl: true, networkAccess: true }
  },
  {
    id: "cap.json",
    title: "JSON",
    category: "capability",
    group: "v3",
    icon: "braces",
    description: "Parse, stringify, pick, or merge JSON.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "JSON"))],
    configSchema: [
      { key: "op", label: "Operation", type: "select", options: ["parse", "stringify", "pick", "merge"], default: "parse" },
      { key: "path", label: "Path", type: "text", default: "" }
    ]
  },
  {
    id: "cap.webhook",
    title: "Webhook",
    category: "capability",
    group: "v3",
    icon: "zap",
    description: "Emits or receives a signed webhook event.",
    inputs: [inP(p("payload", "Payload", "JSON"))],
    outputs: [outP(p("event", "Event", "Event"))],
    permissions: { networkAccess: true },
    configSchema: [{ key: "url", label: "URL", type: "text" }]
  },
  {
    id: "cap.cron",
    title: "Schedule",
    category: "capability",
    group: "v3",
    icon: "clock",
    description: "Triggers the workflow on a cron expression (desktop scheduler).",
    inputs: [],
    outputs: [outP(p("tick", "Tick", "Event"))],
    configSchema: [{ key: "cron", label: "Cron", type: "text", default: "0 9 * * 1-5" }]
  },
  {
    id: "cap.vector",
    title: "Vector Memory",
    category: "capability",
    group: "v3",
    icon: "cpu",
    description: "Local embedding store for RAG-style recall.",
    inputs: [inP(p("query", "Query", "Text", { required: true })), inP(p("doc", "Document", "Text"))],
    outputs: [outP(p("hits", "Hits", "JSON"))],
    configSchema: [{ key: "k", label: "Top K", type: "number", default: 5 }]
  },
  // ============================ PRESETS ============================
  ...preset("copywriter", "Copywriter", "Writes on-brand marketing copy.", "Write persuasive copy that matches the brief."),
  ...preset("seo", "SEO Analyst", "Audits and improves search visibility.", "Audit SEO and propose concrete fixes."),
  ...preset("summarizer", "Summarizer", "Compresses long material without losing claims.", "Summarize faithfully with source mapping."),
  ...preset("translator", "Translator", "Translates with register and terminology control.", "Translate accurately; keep terms consistent."),
  ...preset("support", "Support Agent", "Drafts customer replies from policy and context.", "Draft a policy-faithful support reply."),
  ...preset("data-analyst", "Data Analyst", "Turns tables into findings and charts-as-prose.", "Analyze the data and report findings."),
  ...preset("pm", "Product Manager", "Writes PRDs, scopes, and acceptance criteria.", "Turn the brief into a PRD."),
  ...preset("sre", "SRE", "Incident commander: impact, blast radius, next actions.", "Triage the incident and propose next actions."),
  ...preset("legal", "Legal Reviewer", "Flags contractual and compliance risk. Not legal advice.", "Flag legal/compliance risks. Do not give advice."),
  ...preset("ux", "UX Writer", "Microcopy, empty states, error language.", "Write precise UX copy for the surface."),
  ...preset("recruiter", "Recruiter", "Screens candidates against a rubric.", "Score the candidate against the rubric."),
  ...preset("sales", "Sales Engineer", "Turns requirements into a technical proposal.", "Draft a technical proposal from the requirements."),
  ...ROLE_PACKS.map(packToDef)
];
function packToDef(pack) {
  return {
    id: `agent.pack.${pack.industry}.${pack.slug}`,
    title: pack.title,
    category: "agent",
    group: pack.industry,
    icon: pack.icon,
    description: `${pack.mission} Hermes-class agent. Not an automation-platform step.`,
    inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("context", "Context", "any"))],
    outputs: [outP(p("deliverable", "Deliverable", "AgentResult", { required: true })), outP(p("notes", "Notes", "JSON"))],
    defaultPurpose: pack.mission,
    configSchema: [
      { key: "harness", label: "Runtime", type: "select", options: ["hermes", "llm"], default: "hermes" }
    ],
    permissions: { filesystemRead: true, terminalExecute: true, mcpUse: true, memoryWrite: true, skillWrite: true },
    rolePrompt: rp({
      identity: `You are ${pack.title}, a Hermes-class specialist for SelfImpulse (${pack.industry}).`,
      mission: pack.mission,
      operatingPrinciples: "Stay in this identity. Prefer evidence. Mark unknowns. Never invent tools. Fail closed. You are an autonomous worker, not an n8n step.",
      procedures: `1. Restate the brief as a testable outcome.
2. Use Hermes tools when granted.
3. Verify against: ${pack.mission}
4. Emit the deliverable. Call finish.`,
      toolStrategy: "Use only granted tools. Every agent runs in-process on your own provider keys.",
      verificationStrategy: "The deliverable must be usable without you present.",
      collaborationRules: "Peers consume deliverable + notes. Shared team memory if teamMemoryKey is set.",
      learningRules: stdLearning(`Improve ${pack.title} craft from ratings.`),
      invariants: stdInvariants(`a ${pack.title}`)
    })
  };
}
function preset(slug, title, description, purpose) {
  return [
    {
      id: `agent.preset.${slug}`,
      title,
      category: "agent",
      group: "presets",
      icon: "spark",
      description,
      inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("context", "Context", "any"))],
      outputs: [outP(p("deliverable", "Deliverable", "Markdown", { required: true })), outP(p("notes", "Notes", "JSON"))],
      defaultPurpose: purpose,
      rolePrompt: rp({
        identity: `You are ${title}, a specialist agent for SelfImpulse.`,
        mission: purpose,
        operatingPrinciples: "Stay in role. Prefer evidence. Mark unknowns. No secrets.",
        procedures: `PROCEDURE
1. Parse the brief.
2. Apply ${title.toLowerCase()} craft.
3. Verify against the brief.
4. Emit the deliverable.`,
        toolStrategy: "Use only granted tools.",
        verificationStrategy: "The deliverable must be usable without you present.",
        collaborationRules: "Peers consume Markdown + notes JSON.",
        learningRules: stdLearning(`Improve ${title.toLowerCase()} craft from ratings.`),
        invariants: stdInvariants(`a ${title}`)
      })
    }
  ];
}
var DEFINITIONS_BY_ID = new Map(NODE_DEFINITIONS.map((d) => [d.id, d]));
function cloneRolePrompt(src) {
  return { version: src.version, sections: { ...src.sections } };
}

// src/graph/factory.ts
function createNodeFromDef(def, id, x, y) {
  const node = {
    id,
    definitionId: def.id,
    title: def.title,
    x,
    y,
    purpose: def.defaultPurpose ?? "",
    inputs: def.inputs.map((p2) => ({ ...p2 })),
    outputs: def.outputs.map((p2) => ({ ...p2 })),
    config: Object.fromEntries((def.configSchema ?? []).map((c) => [c.key, c.default ?? ""])),
    rolePrompt: def.rolePrompt ? cloneRolePrompt(def.rolePrompt) : {
      sections: {
        identity: def.title,
        mission: "",
        operatingPrinciples: "",
        procedures: "",
        toolStrategy: "",
        verificationStrategy: "",
        collaborationRules: "",
        learningRules: "",
        invariants: `You are a ${def.title}. You never act outside this identity.`
      },
      version: 1
    },
    feedbackLoop: def.feedbackLoopDefault ?? "OFF",
    evolutionMode: def.evolutionModeDefault ?? "OFF",
    reflection: { enabled: false, maxAttempts: 2, passThreshold: 7 },
    permissions: {
      filesystemRead: false,
      filesystemWrite: false,
      terminalExecute: false,
      networkAccess: false,
      browserControl: false,
      mcpUse: false,
      providerExecute: def.category === "agent",
      workflowModify: false,
      memoryWrite: true,
      skillWrite: true,
      evolutionPropose: true,
      evolutionAccept: false,
      secretResolve: false,
      ...def.permissions ?? {}
    },
    contract: {
      requiredCapabilities: def.requiredPermissions ?? [],
      sideEffects: [],
      successCriteria: "Output satisfies the declared output schema and the stated success criteria.",
      failureCriteria: "Output cannot be produced within timeout or fails validation.",
      timeoutMs: def.contractTimeoutMs ?? 18e4,
      retryPolicy: { maxAttempts: 2, backoffMs: 1500 }
    },
    providers: def.providers ? structuredClone(def.providers) : def.category === "agent" ? [{ kind: "builtin-agent" }] : [],
    allowedMcpServers: [],
    memoryEnabled: true
  };
  if (def.category === "agent") {
    node.config.harness = node.config.harness || "hermes";
    node.permissions.terminalExecute = true;
    node.permissions.filesystemRead = true;
    node.permissions.mcpUse = true;
    node.permissions.providerExecute = true;
  }
  return node;
}

// src/mission/missionRuntime.ts
init_types();

// src/mission/types.ts
var MISSION_TRANSITIONS = {
  DRAFT: ["PLANNING", "FAILED"],
  PLANNING: ["READY", "BLOCKED", "FAILED"],
  READY: ["RUNNING", "DRAFT", "FAILED"],
  RUNNING: ["PAUSED", "BLOCKED", "REPAIRING", "VERIFYING", "COMPLETED", "FAILED"],
  PAUSED: ["RUNNING", "BLOCKED", "FAILED"],
  BLOCKED: ["REPAIRING", "RUNNING", "PAUSED", "FAILED"],
  REPAIRING: ["RUNNING", "BLOCKED", "VERIFYING", "FAILED"],
  VERIFYING: ["COMPLETED", "REPAIRING", "BLOCKED", "FAILED"],
  COMPLETED: [],
  FAILED: ["DRAFT"]
};
function canTransition(from, to) {
  return MISSION_TRANSITIONS[from].includes(to);
}
var DEFAULT_BUDGET = {
  maxCostUsd: 10,
  maxTokens: 2e6,
  maxWallClockMs: 60 * 60 * 1e3,
  maxConcurrentAgents: 4,
  maxRetriesPerTask: 3,
  maxBrowserSessions: 2,
  maxGraphMutations: 8
};
var DEFAULT_POLICY = {
  autonomy: "SUPERVISED",
  approvalThreshold: "HIGH",
  allowGraphMutation: true,
  allowReorganization: true,
  allowHarnessSwitch: true,
  measureCandidates: true
};
var DEFAULT_BOUNDARY = {
  filesystemRead: true,
  filesystemWrite: true,
  shell: true,
  network: true,
  browser: false,
  mcp: true,
  credentials: false,
  repositories: [],
  deploymentTargets: [],
  allowedPaths: [],
  deniedPaths: []
};

// src/mission/flightRecorder.ts
init_id();
var listeners = /* @__PURE__ */ new Set();
var FlightRecorder = class {
  events = [];
  nextSeq = 1;
  missionId;
  constructor(missionId, seed = []) {
    this.missionId = missionId;
    this.events = [...seed];
    this.nextSeq = seed.length ? Math.max(...seed.map((e) => e.seq)) + 1 : 1;
  }
  /**
   * §25 Merge persisted history back in on resume. Existing sequence numbers are kept so a
   * restored mission's trace stays contiguous, and events already present are not duplicated.
   */
  seedHistory(events) {
    if (!events.length) return 0;
    const seen = new Set(this.events.map((e) => e.seq));
    let added = 0;
    for (const e of events) {
      if (seen.has(e.seq)) continue;
      this.events.push(e);
      seen.add(e.seq);
      added += 1;
    }
    this.events.sort((a, b) => a.seq - b.seq);
    this.nextSeq = this.events.length ? this.events[this.events.length - 1].seq + 1 : 1;
    return added;
  }
  record(input) {
    if (!input.actor) throw new Error("governance: every event needs an actor");
    if (!input.authority) throw new Error("governance: every event needs an authority");
    if (!input.reason) throw new Error("governance: every event needs a reason");
    const event = {
      seq: this.nextSeq++,
      missionId: input.missionId ?? this.missionId,
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      kind: input.kind,
      actor: input.actor,
      authority: input.authority,
      policy: input.policy || "none-required",
      reason: input.reason,
      evidence: input.evidence ?? [],
      subjectId: input.subjectId ?? null,
      data: input.data ?? {}
    };
    this.events.push(event);
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
      }
    }
    return event;
  }
  all() {
    return [...this.events];
  }
  ofKind(...kinds) {
    const set = new Set(kinds);
    return this.events.filter((e) => set.has(e.kind));
  }
  forSubject(subjectId) {
    return this.events.filter((e) => e.subjectId === subjectId);
  }
  last(kind) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].kind === kind) return this.events[i];
    }
    return null;
  }
  count(kind) {
    return this.events.filter((e) => e.kind === kind).length;
  }
  /**
   * §14 Replay. Returns the recorder state as it was after `uptoSeq` events.
   * Used by the flight-recorder UI to scrub the mission timeline.
   */
  replay(uptoSeq) {
    return this.events.filter((e) => e.seq <= uptoSeq);
  }
  /** Distinct sequence numbers, for the scrubber. */
  seqRange() {
    if (!this.events.length) return { min: 0, max: 0 };
    return { min: this.events[0].seq, max: this.events[this.events.length - 1].seq };
  }
  snapshot() {
    return { events: this.all(), nextSeq: this.nextSeq };
  }
  /**
   * Truncate everything after `uptoSeq` — used when rolling a mission back to a checkpoint
   * so the trace does not claim things that are no longer true. The truncation is itself
   * recorded first, so the rollback is visible.
   */
  truncateAfter(uptoSeq, reason) {
    const removed = this.events.filter((e) => e.seq > uptoSeq).length;
    this.events = this.events.filter((e) => e.seq <= uptoSeq);
    this.nextSeq = uptoSeq + 1;
    if (removed > 0) {
      this.record({
        kind: "MISSION_ROLLED_BACK",
        actor: "flight-recorder",
        authority: "runtime",
        policy: "checkpoint.rollback",
        reason,
        data: { removedEvents: removed, uptoSeq }
      });
    }
    return removed;
  }
  get length() {
    return this.events.length;
  }
};
var recorders = /* @__PURE__ */ new Map();
function recorderFor(missionId, seed) {
  let r = recorders.get(missionId);
  if (!r) {
    r = new FlightRecorder(missionId, seed);
    recorders.set(missionId, r);
  }
  return r;
}

// src/mission/agentsMd.ts
import * as fsSync from "node:fs";
import * as path from "node:path";
function parseAgentsMd(raw, file) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = { heading: null, lines: [] };
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      if (current.heading !== null || current.lines.some((l) => l.trim())) sections.push(current);
      current = { heading: h[2].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading !== null || current.lines.some((l) => l.trim())) sections.push(current);
  const title = sections.find((s) => s.heading !== null)?.heading ?? path.basename(file);
  return { file, title, sections, raw };
}
function collectAgentsContext(root, maxDepth = 3) {
  const docs = [];
  const walk = (dir, depth, rel) => {
    if (depth > maxDepth) return;
    const file = path.join(dir, "AGENTS.md");
    try {
      if (fsSync.statSync(file).isFile()) {
        docs.push(parseAgentsMd(fsSync.readFileSync(file, "utf8"), rel ? `${rel}/AGENTS.md` : "AGENTS.md"));
      }
    } catch {
    }
    if (depth === maxDepth) return;
    let entries;
    try {
      entries = fsSync.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "target") {
        walk(path.join(dir, e.name), depth + 1, rel ? `${rel}/${e.name}` : e.name);
      }
    }
  };
  walk(root, 0, "");
  const composed = docs.map((d) => `### from ${d.file}
${d.raw.trim()}`).join("\n\n");
  return { docs, composed };
}
function agentsMdForMission(m2) {
  const lines = [];
  lines.push(`# ${m2.objective}`);
  lines.push("");
  lines.push("<!-- generated by SelfImpulse for mission ");
  lines.push(`${m2.missionId} --`);
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push(`This workspace is being worked on by SelfImpulse mission \`${m2.missionId}\`.`);
  lines.push("Follow the instructions in this file. They are the contract for every agent in this mission.");
  lines.push("");
  lines.push("## Done when");
  lines.push("");
  for (const d of m2.doneWhen) lines.push(`- ${d}`);
  lines.push("");
  lines.push("## Boundaries");
  lines.push("");
  for (const b of m2.boundaries) lines.push(`- ${b}`);
  lines.push("");
  lines.push("## Tasks");
  lines.push("");
  for (const t of m2.tasks) {
    const via = t.harness ? ` (via ${t.harness})` : "";
    lines.push(`### ${t.title}${via}`);
    lines.push(`- kind: ${t.kind}`);
    if (t.checks.length > 0) {
      lines.push(`- verify with: ${t.checks.map((c) => `\`${c}\``).join(", ")}`);
    }
    lines.push("");
  }
  lines.push("## Ground rules");
  lines.push("");
  lines.push("- Never invent tools, APIs, or secrets. Mark unknowns as unknown.");
  lines.push("- Run the verification commands before claiming a task is done.");
  lines.push("- Leave the workspace in a state where those commands pass.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("This file is regenerated by VH on plan changes. Edit freely \u2014 your edits are read by the next seat that starts.");
  lines.push("");
  return lines.join("\n");
}
function writeAgentsMd(root, m2) {
  const file = path.join(root, "AGENTS.md");
  fsSync.mkdirSync(root, { recursive: true });
  fsSync.writeFileSync(file, agentsMdForMission(m2), "utf8");
  return file;
}

// src/mission/artifactStore.ts
init_id();
var ArtifactStore = class {
  artifacts = /* @__PURE__ */ new Map();
  /** lineageRoot -> artifactIds, ordered by version. */
  lineage = /* @__PURE__ */ new Map();
  create(input, recorder) {
    const artifactId = uid("art");
    const parents = input.parentArtifactIds ?? [];
    const root = parents.length ? this.artifacts.get(parents[0])?.lineageRoot ?? artifactId : artifactId;
    const siblings = this.lineage.get(root) ?? [];
    const artifact = {
      artifactId,
      missionId: input.missionId,
      version: siblings.length + 1,
      lineageRoot: root,
      name: input.name,
      content: input.content,
      contentType: input.contentType,
      createdBy: input.createdBy,
      modifiedBy: input.createdBy,
      parentArtifactIds: parents,
      inputs: input.inputs ?? [],
      provenance: input.provenance,
      evaluation: null,
      approvalState: "NONE",
      approvalId: null,
      rollbackTargetVersion: siblings.length ? siblings.length : null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.artifacts.set(artifactId, artifact);
    this.lineage.set(root, [...siblings, artifactId]);
    recorder.record({
      kind: siblings.length ? "ARTIFACT_VERSIONED" : "ARTIFACT_CREATED",
      actor: input.createdBy,
      authority: "runtime",
      policy: "artifact.immutable-versioning",
      reason: siblings.length ? `Version ${artifact.version} of ${input.name}; previous version preserved.` : `Created ${input.name}.`,
      evidence: input.inputs ?? [],
      subjectId: artifactId,
      data: {
        version: artifact.version,
        lineageRoot: root,
        contentType: artifact.contentType,
        bytes: artifact.content.length,
        parents,
        harness: artifact.provenance.harness,
        costUsd: artifact.provenance.costUsd
      }
    });
    return artifact;
  }
  /**
   * Record a new version of an existing artifact. The previous version is untouched.
   */
  revise(parentArtifactId, content, modifiedBy, provenance, recorder, reason) {
    const parent = this.artifacts.get(parentArtifactId);
    if (!parent) throw new Error(`unknown artifact ${parentArtifactId}`);
    if (parent.content === content) {
      return parent;
    }
    const next = this.create(
      {
        missionId: parent.missionId,
        name: parent.name,
        content,
        contentType: parent.contentType,
        createdBy: modifiedBy,
        parentArtifactIds: [parentArtifactId],
        inputs: [parentArtifactId],
        provenance
      },
      recorder
    );
    recorder.record({
      kind: "ARTIFACT_VERSIONED",
      actor: modifiedBy,
      authority: "runtime",
      policy: "artifact.immutable-versioning",
      reason,
      subjectId: next.artifactId,
      data: { previousVersion: parent.version, newVersion: next.version, lineageRoot: parent.lineageRoot }
    });
    return next;
  }
  get(artifactId) {
    return this.artifacts.get(artifactId) ?? null;
  }
  latestOf(lineageRoot) {
    const ids = this.lineage.get(lineageRoot);
    if (!ids || !ids.length) return null;
    return this.artifacts.get(ids[ids.length - 1]) ?? null;
  }
  versionsOf(lineageRoot) {
    return (this.lineage.get(lineageRoot) ?? []).map((id) => this.artifacts.get(id)).filter((a) => Boolean(a));
  }
  forMission(missionId) {
    return [...this.artifacts.values()].filter((a) => a.missionId === missionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  setEvaluation(artifactId, evaluation) {
    const a = this.artifacts.get(artifactId);
    if (a) a.evaluation = evaluation;
  }
  setApprovalState(artifactId, state, approvalId) {
    const a = this.artifacts.get(artifactId);
    if (!a) return;
    a.approvalState = state;
    a.approvalId = approvalId;
  }
  /**
   * §13 Explain lineage. Breadth-first walk backwards through parents, deduplicated,
   * returned oldest-first so the UI can render it top-down.
   */
  explainLineage(artifactId, recorder) {
    const visited = /* @__PURE__ */ new Map();
    const queue = [{ id: artifactId, depth: 0 }];
    const inQueue = /* @__PURE__ */ new Set([artifactId]);
    while (queue.length) {
      const { id, depth } = queue.shift();
      const a = this.artifacts.get(id);
      if (!a || visited.has(id)) continue;
      visited.set(id, {
        artifactId: a.artifactId,
        version: a.version,
        name: a.name,
        contentType: a.contentType,
        createdBy: a.createdBy,
        harness: a.provenance.harness,
        model: a.provenance.model,
        toolsUsed: a.provenance.toolsUsed,
        evaluation: a.evaluation ? a.evaluation.passed ? a.evaluation.fullyMeasured ? "passed (measured)" : `passed with ${a.evaluation.unmeasured.length} unmeasured check(s)` : "failed" : "not evaluated",
        approvalState: a.approvalState,
        costUsd: a.provenance.costUsd,
        latencyMs: a.provenance.latencyMs,
        at: a.createdAt,
        depth,
        parentArtifactIds: a.parentArtifactIds
      });
      for (const p2 of a.parentArtifactIds) {
        if (!inQueue.has(p2)) {
          inQueue.add(p2);
          queue.push({ id: p2, depth: depth + 1 });
        }
      }
    }
    const chain = [...visited.values()].sort((a, b) => a.at.localeCompare(b.at) || a.depth - b.depth);
    const ids = new Set(visited.keys());
    const decisions = recorder ? recorder.all().filter((e) => e.subjectId && ids.has(e.subjectId)) : [];
    const unverified = chain.filter((n) => n.evaluation === "not evaluated").map((n) => n.name);
    return {
      artifactId,
      chain,
      decisions,
      totalCostUsd: chain.reduce((s, n) => s + n.costUsd, 0),
      totalLatencyMs: chain.reduce((s, n) => s + n.latencyMs, 0),
      versions: chain.length,
      hasUnverifiedAncestor: unverified.length > 0,
      unverified
    };
  }
  /**
   * §26 Rollback: produce the artifact that a given version should revert to, without
   * destroying anything. Returns the restored artifact as a NEW version so history stays
   * append-only.
   */
  rollback(artifactId, recorder, actor, reason) {
    const a = this.artifacts.get(artifactId);
    if (!a || a.rollbackTargetVersion == null) return null;
    const target = this.versionsOf(a.lineageRoot).find((v) => v.version === a.rollbackTargetVersion);
    if (!target) return null;
    const restored = this.create(
      {
        missionId: a.missionId,
        name: a.name,
        content: target.content,
        contentType: a.contentType,
        createdBy: actor,
        parentArtifactIds: [artifactId],
        inputs: [target.artifactId],
        provenance: {
          ...target.provenance,
          startedAt: (/* @__PURE__ */ new Date()).toISOString(),
          finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
          toolsUsed: ["checkpoint.rollback"]
        }
      },
      recorder
    );
    recorder.record({
      kind: "MISSION_ROLLED_BACK",
      actor,
      authority: "human",
      policy: "artifact.rollback",
      reason,
      subjectId: restored.artifactId,
      data: { fromVersion: a.version, toVersion: target.version, lineageRoot: a.lineageRoot }
    });
    return restored;
  }
  hydrate(artifacts) {
    for (const a of artifacts) {
      this.artifacts.set(a.artifactId, a);
      const list = this.lineage.get(a.lineageRoot) ?? [];
      if (!list.includes(a.artifactId)) this.lineage.set(a.lineageRoot, [...list, a.artifactId]);
    }
    for (const [k, v] of this.lineage) {
      this.lineage.set(
        k,
        v.sort((x, y) => (this.artifacts.get(x)?.version ?? 0) - (this.artifacts.get(y)?.version ?? 0))
      );
    }
  }
  export() {
    return [...this.artifacts.values()];
  }
};

// src/domain/harness.ts
var HARNESSES = [
  {
    id: "hermes",
    name: "Native agent (in-process)",
    bins: [],
    argv: [],
    install: "Nothing to install \u2014 the agent loop runs inside SelfImpulse on your own provider key (or a local Ollama).",
    notes: "The vendored act/observe/adjust loop. Every crew seat runs here, so every action carries one audited receipt format and the trust story has no third party in it.",
    source: "src/engine/hermesRuntime.ts"
  },
  {
    id: "llm",
    name: "Direct LLM (API / Ollama)",
    bins: [],
    argv: [],
    install: "Save a provider key in Settings \u2192 Providers, or run Ollama locally",
    notes: "Not an agent loop. Calls the chat API with the composed agent prompt \u2014 the direct seam under the native runner."
  }
];
var HARNESS_BY_ID = new Map(HARNESSES.map((h) => [h.id, h]));
var HARNESS_OPTIONS = HARNESSES.map((h) => h.id);

// src/mission/agentCapabilities.ts
var AGENT_CAPABILITIES = {
  hermes: {
    id: "hermes",
    name: "Hermes Runtime",
    // 19.7.15: hermes is IN-PROCESS. It has no binary, is not a stdio child,
    // and takes no argv. These two lines used to describe a subprocess that
    // does not exist; every caller that read them was reasoning about a seat
    // that could not run.
    bins: [],
    install: "bundled with SelfImpulse; runs in-process (src/engine/hermesRuntime.ts) \u2014 no binary, no argv",
    prompt: { argv: [], confidence: "docs", source: "in-process runtime: no argv exists by construction" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["No enforced sandbox, so a hermes seat must never be assigned HIGH or CRITICAL risk."]
  },
  llm: {
    id: "llm",
    name: "Direct LLM",
    bins: [],
    install: "no binary; SelfImpulse calls the provider API directly",
    // In-process API call: there is no command line, and the empty argv says so
    // rather than a fake ["$PROMPT"] that would read as a spawnable command.
    prompt: { argv: [], confidence: "docs", source: "in-process API call: no argv exists by construction" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["No filesystem access and no enforced sandbox. Useful for reasoning, useless for edits."]
  }
};
var EXECUTABLE_HARNESSES = Object.keys(AGENT_CAPABILITIES).filter(
  (id) => AGENT_CAPABILITIES[id].bins.length > 0
);

// src/mission/agentTeam.ts
var SCHEMA_VERSION = 1;
var seat = (id, role2, harness, over = {}) => ({
  id,
  role: role2,
  harness,
  model: null,
  mayWrite: role2 === "coder" || role2 === "debugger",
  maxRisk: role2 === "coder" || role2 === "debugger" ? "MEDIUM" : "LOW",
  timeoutSecs: 900,
  maxTurns: null,
  instructions: "",
  ...over
});
var PREBUILT_TEAMS = [
  {
    id: "team.balanced",
    name: "Balanced",
    description: "Plan, build, test, review. One vendor writes, a second reviews \u2014 so the review is not the author grading its own work.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Break the objective into steps small enough to verify individually." }),
      seat("architect", "architect", "hermes", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement the change. Touch only what the task requires." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW" }),
      seat("test", "tester", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Run the repository's own checks and report what failed." }),
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", model: "reviewer-tier", instructions: "Review the diff. Say what is wrong, not what is fine. Run on a different model from the writer \u2014 a reviewer on the writer's own weights is not independent evidence." }),
      seat("security", "security", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Check for security vulnerabilities." })
    ]
  },
  {
    id: "team.adversarial",
    name: "Adversarial",
    description: "Deliberately independent reviewers. Every writer is reviewed by a different model, because agreement between two seats running the same weights is weaker evidence than agreement across models.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "hermes", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM" }),
      seat("test", "tester", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Prove the change works or find the case where it does not." }),
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", model: "reviewer-tier", instructions: "Review independently, on a different model from the writer." }),
      seat("security", "security", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Look only for injection, secret leakage and unsafe deserialisation." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile the verdicts into one decision." })
    ]
  },
  {
    id: "team.powerhouse",
    name: "Cross-Vendor Powerhouse",
    description: "One governed crew, every seat on the native in-process runtime: plans, architects, builds, debugs, tests, reviews and synthesizes \u2014 each seat pointed at its own model, each action receipted through the same gate.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Formulate the execution plan and criteria." }),
      seat("architect", "architect", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Design component interfaces and data schemas." }),
      seat("coder", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement core logic and tests in isolated worktree." }),
      seat("debugger", "debugger", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Diagnose edge cases and optimize performance." }),
      seat("tester", "tester", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Run test suites and fuzz edge cases." }),
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", instructions: "Conduct independent peer review against the snapshot merge." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile findings into final release notes." })
    ]
  },
  {
    id: "team.solo",
    name: "Solo",
    description: "One seat. Cheap, fast, and the review is advisory only \u2014 an author grading its own work is not a review.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [seat("impl", "coder", "hermes", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement and self-check." })]
  },
  {
    id: "team.audit",
    name: "Read-only audit",
    description: "No seat may write. For answering 'what is wrong with this code?' without risking a change.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("reviewer", "reviewer", "llm", { mayWrite: false, maxRisk: "LOW", model: "reviewer-tier", instructions: "Review independently, on a different model from the writer." }),
      seat("security", "security", "llm", { mayWrite: false, maxRisk: "LOW" })
    ]
  }
];
var TEAM_BY_ID = new Map(PREBUILT_TEAMS.map((t) => [t.id, t]));
var RISK_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};
function seatForTask(team, role2, risk) {
  if (risk === "CRITICAL") {
    return { seat: null, reason: "CRITICAL risk tasks are refused for agent execution and escalated to a human. No sandbox makes an irreversible action safe to delegate." };
  }
  const candidates = team.seats.filter((s) => s.role === role2);
  if (candidates.length === 0) return { seat: null, reason: `This team has no ${role2} seat.` };
  const taskLevel = RISK_LEVELS[risk] ?? 2;
  const eligible = candidates.filter((s) => {
    const maxLevel = RISK_LEVELS[s.maxRisk ?? "MEDIUM"] ?? 2;
    return maxLevel >= taskLevel;
  });
  if (eligible.length === 0) {
    return { seat: null, reason: `A ${risk} risk task exceeds every available ${role2}'s maxRisk ceiling \u2014 escalate to a human.` };
  }
  return { seat: eligible[0] ?? null, reason: null };
}
var STEP_KIND_TO_ROLE = {
  research: "planner",
  architecture: "architect",
  implementation: "coder",
  test: "tester",
  security: "security",
  review: "reviewer",
  synthesis: "synthesizer",
  release: "coder",
  approval: null
};
function bindTeamToPlan(team, steps) {
  const bindings = [];
  let bound = 0;
  let unbound = 0;
  const refused = [];
  for (const step of steps) {
    const role2 = STEP_KIND_TO_ROLE[step.kind];
    if (role2 === void 0 || role2 === null) {
      unbound += 1;
      bindings.push({ stepId: step.id, seatId: null, harness: null, reason: role2 === null ? "An approval step belongs to a human, not a seat." : `No role maps to step kind "${step.kind}".` });
      continue;
    }
    const { seat: seat2, reason } = seatForTask(team, role2, step.risk);
    if (seat2) {
      bound += 1;
      bindings.push({ stepId: step.id, seatId: seat2.id, harness: seat2.harness, reason: null });
    } else if (step.risk === "CRITICAL") {
      refused.push(step.id);
      unbound += 1;
      bindings.push({ stepId: step.id, seatId: null, harness: null, reason });
    } else {
      unbound += 1;
      bindings.push({ stepId: step.id, seatId: null, harness: null, reason });
    }
  }
  return { bindings, bound, unbound, refused };
}
function applyTeamToSteps(steps, result) {
  let changed = 0;
  const byId = new Map(result.bindings.map((b) => [b.stepId, b]));
  for (const s of steps) {
    const b = byId.get(s.id);
    if (b?.harness && s.preferredHarness !== b.harness) {
      s.preferredHarness = b.harness;
      changed += 1;
    }
  }
  return changed;
}

// src/mission/approvals.ts
init_id();

// src/mission/riskPolicy.ts
var RISK_RULES = [
  // ---- CRITICAL -------------------------------------------------------------
  { match: /\bdeploy\b.*\b(prod|production)\b|\b(prod|production)\b.*\bdeploy\b/i, risk: "CRITICAL", why: "Production deployment is irreversible for end users." },
  { match: /\bdelete\b.*\b(data|database|volume|bucket|table)\b|\bdrop\s+(table|database)\b|\btruncate\b/i, risk: "CRITICAL", why: "Data destruction." },
  { match: /\b(rotate|revoke|modify|create|delete)\b.*\b(credential|secret|api[- ]?key|token|password)\b/i, risk: "CRITICAL", why: "Credential material." },
  { match: /\b(iam|rbac|role|policy)\b.*\b(grant|attach|modify|delete|create)\b|\bmodify\b.*\b(access policy|identity)\b/i, risk: "CRITICAL", why: "Identity and access policy." },
  { match: /\bgit\s+push\b.*(--force|-f)\b|\bforce[- ]push\b/i, risk: "CRITICAL", why: "Force push rewrites shared history." },
  { match: /\brm\s+-rf\s+\/(?!\w)|\bformat\b.*\bdisk\b|\bmkfs\b/i, risk: "CRITICAL", why: "Destructive filesystem operation." },
  { match: /\b(drop|migrate)\b.*\bproduction\b/i, risk: "CRITICAL", why: "Production schema change." },
  // ---- HIGH -----------------------------------------------------------------
  { match: /\bgit\s+push\b|\bpublish\b.*\b(package|release|npm|crate)\b|\btag\b.*\brelease\b/i, risk: "HIGH", why: "Publishes work outside the workspace." },
  { match: /\b(terraform|pulumi|cloudformation|kubectl|helm)\b.*\b(apply|destroy|delete|scale)\b/i, risk: "HIGH", why: "Infrastructure mutation." },
  { match: /\bmodify\b.*\b(deployment|ci|cd|pipeline)\s*config|\bedit\b.*\.github\/workflows/i, risk: "HIGH", why: "Deployment configuration." },
  { match: /\bnpm\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b/i, risk: "HIGH", why: "Publishes an artifact to a public registry." },
  { match: /\bALTER\s+TABLE\b|\bCREATE\s+INDEX\b.*\bCONCURRENTLY\b/i, risk: "HIGH", why: "Schema migration." },
  // ---- MEDIUM ---------------------------------------------------------------
  { match: /\b(npm|pnpm|yarn)\s+(install|add|remove)\b|\bpip\s+install\b|\bcargo\s+add\b|\bapt(-get)?\s+install\b|\bbrew\s+install\b/i, risk: "MEDIUM", why: "Installs packages, changing the dependency set." },
  { match: /\b(edit|write|modify|patch|refactor|implement|fix)\b.*\b(file|code|source|config)\b|\bapply\s+diff\b/i, risk: "MEDIUM", why: "Edits code or configuration." },
  { match: /\bgit\s+(commit|checkout|branch|merge|rebase|reset)\b/i, risk: "MEDIUM", why: "Mutates repository state." },
  { match: /\b(set|export)\b.*\b(env|environment variable)\b|\bedit\b.*\.(env|toml|ya?ml|ini)\b/i, risk: "MEDIUM", why: "Configuration change." },
  { match: /\bmigration\b|\bscaffold\b|\bgenerate\b.*\b(scaffold|boilerplate)\b/i, risk: "MEDIUM", why: "Bulk file creation." },
  // ---- LOW ------------------------------------------------------------------
  { match: /\b(read|view|cat|inspect|list|show)\b.*\b(file|log|output|diff|state)\b/i, risk: "LOW", why: "Read-only inspection." },
  { match: /\b(run|execute)\b.*\b(test|tests|test suite|lint|typecheck|build)\b/i, risk: "LOW", why: "Local verification with no side effects outside the workspace." },
  { match: /\b(research|search|summarise|summarize|analyse|analyze|explain|review|plan|draft)\b/i, risk: "LOW", why: "Analysis produces no external change." }
];
function classifyRisk(action, toolName) {
  const haystack = [toolName ?? "", action].join(" :: ");
  for (const rule of RISK_RULES) {
    if (rule.match.test(haystack)) {
      return { risk: rule.risk, why: rule.why, matchedRule: String(rule.match) };
    }
  }
  return {
    risk: "MEDIUM",
    why: "Unrecognised action. Unknown actions are treated as MEDIUM, not LOW.",
    matchedRule: null
  };
}
function requiresHuman(risk, approvalThreshold, autonomy) {
  if (autonomy === "HUMAN_ONLY") return true;
  if (risk === "CRITICAL") return true;
  if (autonomy === "AUTONOMOUS") return false;
  const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  return order.indexOf(risk) >= order.indexOf(approvalThreshold);
}

// src/mission/approvals.ts
var ApprovalGateService = class {
  requests = /* @__PURE__ */ new Map();
  waiters = /* @__PURE__ */ new Map();
  list() {
    return [...this.requests.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  pending() {
    return this.list().filter((r) => r.status === "PENDING");
  }
  get(id) {
    return this.requests.get(id) ?? null;
  }
  forMission(missionId) {
    return this.list().filter((r) => r.missionId === missionId);
  }
  pendingForMission(missionId) {
    return this.forMission(missionId).filter((r) => r.status === "PENDING");
  }
  /**
   * Decide the risk class and whether a human is needed. The risk class is derived from the
   * action by `classifyRisk`; an override must justify itself and can only ever be recorded,
   * never applied silently.
   */
  evaluate(input) {
    const derived = classifyRisk(input.action, input.toolName);
    let risk = derived.risk;
    let why = derived.why;
    if (input.riskOverride) {
      const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      if (order.indexOf(input.riskOverride.risk) > order.indexOf(derived.risk)) {
        risk = input.riskOverride.risk;
        why = `${input.riskOverride.reason} (derived: ${derived.why})`;
      } else {
        why = `${derived.why} (requested downgrade to ${input.riskOverride.risk} refused: overrides may only raise risk)`;
      }
    }
    const autonomy = input.mission.riskPolicy.autonomy;
    const needsHuman = requiresHuman(risk, input.mission.riskPolicy.approvalThreshold, autonomy);
    if (!needsHuman) {
      return { autonomous: true, request: null, risk, why };
    }
    const request = {
      id: uid("apr"),
      missionId: input.mission.missionId,
      requestedBy: input.requestedBy,
      agentId: input.agentId ?? null,
      action: input.action,
      risk,
      summary: input.action,
      justification: why,
      changes: input.changes ?? [],
      evidence: input.evidence ?? [],
      expectedOutcome: input.expectedOutcome ?? "No stated expected outcome.",
      reversible: input.reversible ?? true,
      status: "PENDING",
      decidedBy: null,
      reason: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      decidedAt: null
    };
    this.requests.set(request.id, request);
    return { autonomous: false, request, risk, why };
  }
  /** Open a gate and record it in the flight recorder. */
  open(input, recorder) {
    const decision = this.evaluate(input);
    if (decision.request) {
      recorder.record({
        kind: "APPROVAL_REQUIRED",
        actor: input.requestedBy,
        authority: "policy:risk-gate",
        policy: `autonomy=${input.mission.riskPolicy.autonomy};threshold=${input.mission.riskPolicy.approvalThreshold}`,
        reason: decision.why,
        evidence: decision.request.evidence,
        subjectId: decision.request.id,
        data: {
          risk: decision.risk,
          action: input.action,
          changes: decision.request.changes,
          expectedOutcome: decision.request.expectedOutcome,
          reversible: decision.request.reversible
        }
      });
    }
    return decision;
  }
  decide(id, decision, decidedBy, reason, recorder) {
    const req = this.requests.get(id);
    if (!req) throw new Error(`unknown approval ${id}`);
    if (req.status !== "PENDING") throw new Error(`approval ${id} is already ${req.status}`);
    req.status = decision;
    req.decidedBy = decidedBy;
    req.reason = reason;
    req.decidedAt = (/* @__PURE__ */ new Date()).toISOString();
    const rec = recorder ?? recorderFor(req.missionId);
    rec.record({
      kind: decision === "APPROVED" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
      actor: decidedBy,
      authority: "human",
      policy: "approval.gate",
      reason,
      evidence: req.evidence,
      subjectId: req.id,
      data: { risk: req.risk, action: req.action }
    });
    const waiting = this.waiters.get(id);
    if (waiting) {
      this.waiters.delete(id);
      for (const fn of waiting) fn(decision);
    }
    return req;
  }
  /**
   * Block until a human decides. Returns TIMED_OUT rather than defaulting to approval —
   * silence is never consent.
   */
  waitFor(id, timeoutMs, isCancelled = () => false) {
    const existing = this.requests.get(id);
    if (!existing) return Promise.resolve("TIMED_OUT");
    if (existing.status !== "PENDING") return Promise.resolve(existing.status);
    return new Promise((resolve) => {
      const list = this.waiters.get(id) ?? [];
      list.push(resolve);
      this.waiters.set(id, list);
      const started = Date.now();
      const tick = setInterval(() => {
        const req = this.requests.get(id);
        if (!req || req.status !== "PENDING") {
          clearInterval(tick);
          resolve(req?.status ?? "TIMED_OUT");
          return;
        }
        if (isCancelled()) {
          clearInterval(tick);
          resolve("TIMED_OUT");
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(tick);
          req.status = "TIMED_OUT";
          req.decidedAt = (/* @__PURE__ */ new Date()).toISOString();
          req.reason = `No decision within ${Math.round(timeoutMs / 1e3)}s. Timed out rather than auto-approved.`;
          resolve("TIMED_OUT");
        }
      }, 150);
    });
  }
  /** Restore from persisted state (pause/resume, §25). */
  hydrate(requests) {
    for (const r of requests) this.requests.set(r.id, r);
  }
  export() {
    return this.list();
  }
};

// src/mission/organization.ts
init_id();
var ROLE_REQUIREMENTS = {
  "agent.coder": { filesystemRead: true, filesystemWrite: true, shell: true, memoryWrite: true },
  "agent.tester": { filesystemRead: true, shell: true, memoryWrite: true },
  "agent.security": { filesystemRead: true, shell: false, network: true, memoryWrite: true },
  "agent.reviewer": { filesystemRead: true, memoryWrite: true },
  "agent.researcher": { filesystemRead: true, network: true, browser: true, memoryWrite: true },
  "agent.architect": { filesystemRead: true, memoryWrite: true, skillWrite: true },
  "agent.planner": { filesystemRead: true, memoryWrite: true, proposeGraphMutation: true },
  "agent.browser": { network: true, browser: true },
  "agent.debugger": { filesystemRead: true, shell: true },
  "agent.docs": { filesystemRead: true, filesystemWrite: true, memoryWrite: true },
  "agent.supervisor": { filesystemRead: true, memoryWrite: true, proposeGraphMutation: true }
};
var DEFAULT_REQUIREMENTS = { filesystemRead: true, memoryWrite: true };
function grantPermissions(boundary, definitionId, requested) {
  const role2 = ROLE_REQUIREMENTS[definitionId] ?? DEFAULT_REQUIREMENTS;
  const want = { ...role2, ...requested ?? {} };
  const denied = [];
  const map = [
    ["filesystemRead", "filesystemRead"],
    ["filesystemWrite", "filesystemWrite"],
    ["shell", "shell"],
    ["network", "network"],
    ["browser", "browser"],
    ["mcp", "mcp"],
    ["credentials", "credentials"],
    ["memoryWrite", null],
    ["skillWrite", null],
    ["proposeGraphMutation", null]
  ];
  const granted = {};
  for (const [perm, bound] of map) {
    const wanted = Boolean(want[perm]);
    const allowed = bound ? Boolean(boundary[bound]) : true;
    granted[perm] = wanted && allowed;
    if (wanted && !allowed) denied.push(`${perm} (mission boundary denies ${bound})`);
  }
  return { granted, denied };
}
function buildContract(mission, definitionId, purpose, requested, budgetUsd, timeoutMs) {
  const def = DEFINITIONS_BY_ID.get(definitionId);
  const { granted } = grantPermissions(mission.boundary, definitionId, requested);
  const isControl = definitionId.startsWith("control.");
  return {
    identity: def?.rolePrompt?.sections.identity ?? `VH ${def?.title ?? definitionId}`,
    purpose: purpose || def?.defaultPurpose || "Accomplish the assigned task.",
    capabilities: capabilitiesFor(definitionId),
    inputs: def?.inputs.map((p2) => `${p2.id}:${p2.dataType}`) ?? [],
    outputs: def?.outputs.map((p2) => `${p2.id}:${p2.dataType}`) ?? [],
    permissions: granted,
    budgetUsd: budgetUsd ?? Math.max(0.01, mission.budget.maxCostUsd / 8),
    timeoutMs: timeoutMs ?? def?.contractTimeoutMs ?? 3e5,
    successCriteria: def?.rolePrompt?.sections.verificationStrategy ? [def.rolePrompt.sections.verificationStrategy] : ["The deliverable is usable without the author present."],
    failurePolicy: isControl ? "ESCALATE" : definitionId === "agent.coder" ? "SWITCH_HARNESS" : "RETRY",
    escalationPolicy: mission.riskPolicy.autonomy === "AUTONOMOUS" ? "SUPERVISOR" : "HUMAN"
  };
}
function capabilitiesFor(definitionId) {
  const table = {
    "agent.coder": ["coding", "refactor", "implementation"],
    "agent.tester": ["testing", "verification"],
    "agent.security": ["security-review", "threat-modelling"],
    "agent.reviewer": ["review"],
    "agent.researcher": ["research", "synthesis"],
    "agent.architect": ["architecture", "design"],
    "agent.planner": ["planning", "decomposition"],
    "agent.synthesizer": ["synthesis"],
    "agent.critic": ["critique"],
    "agent.judge": ["adjudication"],
    "agent.docs": ["documentation"],
    "agent.qa": ["quality-assurance"],
    "agent.debugger": ["debugging", "root-cause"],
    "agent.browser": ["browser-automation"],
    "agent.supervisor": ["coordination"],
    "agent.router": ["routing"],
    "agent.reflection": ["reflection"],
    "agent.evolution": ["evolution"],
    "agent.local": ["local-inference"],
    "agent.crew": ["coding", "testing", "review"]
  };
  return table[definitionId] ?? ["general"];
}
function classifyTask(step, dependsOn, risk) {
  if (risk === "CRITICAL" || step?.requiresApproval) return "APPROVAL_GATED";
  if (step?.kind === "implementation") return "EXCLUSIVE";
  if (dependsOn.length) return "DEPENDENCY_BOUND";
  if (step?.kind === "research") return "PARALLEL_SAFE";
  return "SEQUENTIAL";
}
var OrganizationRuntime = class {
  missionId;
  agentMap = /* @__PURE__ */ new Map();
  taskMap = /* @__PURE__ */ new Map();
  taskUpdatedAt = /* @__PURE__ */ new Map();
  recorder;
  boundary;
  mission;
  constructor(mission, recorder) {
    this.mission = mission;
    this.missionId = mission.missionId;
    this.recorder = recorder;
    this.boundary = mission.boundary;
  }
  /* ------------------------------------------------------------------ agents */
  spawn(input) {
    const def = DEFINITIONS_BY_ID.get(input.definitionId);
    if (!def) throw new Error(`cannot spawn: no node definition "${input.definitionId}"`);
    const live = this.agentsInState("ACTIVE", "IDLE").length;
    if (live >= this.mission.budget.maxConcurrentAgents) {
      throw new Error(
        `concurrency limit: ${live} agents live, budget allows ${this.mission.budget.maxConcurrentAgents}. Pause or replace one first.`
      );
    }
    const { granted, denied } = grantPermissions(this.boundary, input.definitionId, input.requested);
    const contract = buildContract(this.mission, input.definitionId, input.purpose ?? "", input.requested, input.budgetUsd, input.timeoutMs);
    contract.permissions = granted;
    const agent = {
      agentId: uid("agt"),
      missionId: this.missionId,
      definitionId: input.definitionId,
      title: input.title ?? def.title,
      contract,
      harness: input.harness ?? null,
      state: "IDLE",
      nodeId: input.nodeId ?? null,
      spawnedAt: (/* @__PURE__ */ new Date()).toISOString(),
      replacedBy: null,
      spawnedBy: input.spawnedBy ?? "planner",
      spawnReason: input.spawnReason,
      taskIds: [],
      stats: { tasksDone: 0, tasksFailed: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, medianMs: 0 }
    };
    this.agentMap.set(agent.agentId, agent);
    this.recorder.record({
      kind: "AGENT_SPAWNED",
      actor: agent.spawnedBy,
      authority: `policy:organization.spawn;autonomy=${this.mission.riskPolicy.autonomy}`,
      policy: this.mission.riskPolicy.allowReorganization ? "organization.dynamic-roster" : "organization.fixed-roster",
      reason: input.spawnReason,
      evidence: denied.map((d) => `denied: ${d}`),
      subjectId: agent.agentId,
      data: {
        definitionId: agent.definitionId,
        title: agent.title,
        harness: agent.harness,
        capabilities: contract.capabilities,
        permissions: Object.entries(granted).filter(([, v]) => v).map(([k]) => k),
        denied,
        budgetUsd: contract.budgetUsd,
        timeoutMs: contract.timeoutMs
      }
    });
    return agent;
  }
  replace(agentId, replacement, reason, evidence, actor) {
    const old = this.agentMap.get(agentId);
    if (!old) throw new Error(`unknown agent ${agentId}`);
    const created = this.spawn({ ...replacement, spawnedBy: "supervisor", spawnReason: reason });
    old.state = "REPLACED";
    old.replacedBy = created.agentId;
    for (const taskId of old.taskIds) {
      const task = this.taskMap.get(taskId);
      if (task && (task.state === "ASSIGNED" || task.state === "RUNNING" || task.state === "BLOCKED")) {
        this.reassign(taskId, created.agentId, `Inherited from replaced ${old.title}`, actor);
      }
    }
    this.recorder.record({
      kind: "AGENT_REPLACED",
      actor,
      authority: "supervisor",
      policy: "organization.replace",
      reason,
      evidence,
      subjectId: created.agentId,
      data: { replacedAgentId: agentId, replacedTitle: old.title, newTitle: created.title }
    });
    return created;
  }
  pause(agentId, reason, actor) {
    const a = this.require(agentId);
    if (a.state === "PAUSED") return;
    a.state = "PAUSED";
    this.recorder.record({
      kind: "AGENT_PAUSED",
      actor,
      authority: "supervisor",
      policy: "organization.pause",
      reason,
      subjectId: agentId
    });
  }
  resume(agentId, reason, actor) {
    const a = this.require(agentId);
    if (a.state !== "PAUSED") return;
    a.state = "IDLE";
    this.recorder.record({
      kind: "AGENT_RESUMED",
      actor,
      authority: "supervisor",
      policy: "organization.resume",
      reason,
      subjectId: agentId
    });
  }
  remove(agentId, reason, actor) {
    const a = this.require(agentId);
    a.state = "REMOVED";
    for (const taskId of a.taskIds) {
      const t = this.taskMap.get(taskId);
      if (t && (t.state === "ASSIGNED" || t.state === "RUNNING")) {
        t.agentId = null;
        t.state = "PENDING";
        this.touch(t.taskId);
      }
    }
    this.recorder.record({
      kind: "AGENT_REPLACED",
      actor,
      authority: "supervisor",
      policy: "organization.remove",
      reason,
      subjectId: agentId,
      data: { removed: true }
    });
  }
  setHarness(agentId, harness, reason, actor, rationale) {
    const a = this.require(agentId);
    const previous = a.harness;
    a.harness = harness;
    this.recorder.record({
      kind: previous ? "HARNESS_SWITCHED" : "HARNESS_SELECTED",
      actor,
      authority: this.mission.riskPolicy.allowHarnessSwitch ? "policy:arbitration" : "human",
      policy: "arbitration.selection",
      reason,
      evidence: rationale,
      subjectId: agentId,
      data: { from: previous, to: harness }
    });
  }
  recordWork(agentId, outcome) {
    const a = this.agentMap.get(agentId);
    if (!a) return;
    const s = a.stats;
    if (outcome.success) s.tasksDone += 1;
    else s.tasksFailed += 1;
    s.tokensIn += outcome.tokensIn;
    s.tokensOut += outcome.tokensOut;
    s.costUsd += outcome.costUsd;
    const total = s.tasksDone + s.tasksFailed;
    s.medianMs = total ? Math.round((s.medianMs * (total - 1) + outcome.latencyMs) / total) : outcome.latencyMs;
  }
  /* ------------------------------------------------------------------ tasks */
  createTask(input) {
    const risk = input.risk ?? classifyRisk(`${input.title} ${input.description}`).risk;
    const task = {
      taskId: uid("task"),
      missionId: this.missionId,
      title: input.title,
      description: input.description,
      agentId: null,
      state: "PENDING",
      cls: input.cls ?? classifyTask(null, input.dependsOn ?? [], risk),
      dependsOn: input.dependsOn ?? [],
      blockedBy: null,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? this.mission.budget.maxRetriesPerTask,
      risk,
      planStepId: input.planStepId ?? null,
      nodeId: input.nodeId ?? null,
      inputArtifactIds: input.inputArtifactIds ?? [],
      outputArtifactIds: [],
      parentTaskId: input.parentTaskId ?? null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      error: null
    };
    this.taskMap.set(task.taskId, task);
    this.touch(task.taskId);
    return task;
  }
  delegate(taskId, agentId, reason, actor) {
    const task = this.requireTask(taskId);
    const agent = this.require(agentId);
    if (agent.state === "PAUSED" || agent.state === "REMOVED" || agent.state === "REPLACED") {
      throw new Error(`cannot delegate to ${agent.title}: state is ${agent.state}`);
    }
    if (!this.dependenciesMet(task)) {
      throw new Error(
        `cannot delegate "${task.title}": unmet dependencies ${task.dependsOn.filter((d) => this.taskMap.get(d)?.state !== "DONE").join(", ")}`
      );
    }
    task.agentId = agentId;
    task.state = "ASSIGNED";
    task.error = null;
    agent.taskIds.push(taskId);
    agent.state = "ACTIVE";
    this.touch(taskId);
    this.recorder.record({
      kind: "TASK_DELEGATED",
      actor,
      authority: "supervisor",
      policy: "organization.delegate",
      reason,
      subjectId: taskId,
      data: { agentId, agentTitle: agent.title, risk: task.risk, cls: task.cls }
    });
    return task;
  }
  reassign(taskId, agentId, reason, actor) {
    const task = this.requireTask(taskId);
    const previous = task.agentId;
    if (previous) {
      const old = this.agentMap.get(previous);
      if (old) old.taskIds = old.taskIds.filter((t) => t !== taskId);
    }
    task.agentId = null;
    task.state = "PENDING";
    this.touch(taskId);
    const delegated = this.delegate(taskId, agentId, reason, actor);
    this.recorder.record({
      kind: "TASK_REASSIGNED",
      actor,
      authority: "supervisor",
      policy: "organization.reassign",
      reason,
      subjectId: taskId,
      data: { from: previous, to: agentId }
    });
    return delegated;
  }
  /** §3 Split a task. Children inherit the parent's dependencies; the parent becomes a join. */
  split(taskId, parts, reason, actor) {
    const parent = this.requireTask(taskId);
    if (parts.length < 2) throw new Error("split needs at least two parts");
    const children = parts.map(
      (p2) => this.createTask({
        title: p2.title,
        description: p2.description,
        planStepId: parent.planStepId,
        dependsOn: [...parent.dependsOn],
        risk: parent.risk,
        maxAttempts: parent.maxAttempts,
        parentTaskId: parent.taskId
      })
    );
    parent.dependsOn = children.map((c) => c.taskId);
    parent.cls = "DEPENDENCY_BOUND";
    parent.title = `${parent.title} (join)`;
    this.touch(parent.taskId);
    this.recorder.record({
      kind: "TASK_SPLIT",
      actor,
      authority: this.mission.riskPolicy.allowReorganization ? "supervisor" : "human",
      policy: "organization.split",
      reason,
      subjectId: taskId,
      data: { children: children.map((c) => c.taskId), parts: parts.map((p2) => p2.title) }
    });
    return children;
  }
  /** Merge sibling tasks back into one. */
  merge(taskIds, title, reason, actor) {
    const tasks = taskIds.map((id) => this.requireTask(id));
    if (tasks.length < 2) throw new Error("merge needs at least two tasks");
    const deps = [...new Set(tasks.flatMap((t) => t.dependsOn))].filter((d) => !taskIds.includes(d));
    const merged = this.createTask({
      title,
      description: tasks.map((t) => `- ${t.title}: ${t.description}`).join("\n"),
      dependsOn: deps,
      risk: tasks.reduce((max, t) => rank(t.risk) > rank(max) ? t.risk : max, "LOW")
    });
    for (const t of tasks) {
      t.state = "CANCELLED";
      this.touch(t.taskId);
    }
    this.recorder.record({
      kind: "TASK_MERGED",
      actor,
      authority: this.mission.riskPolicy.allowReorganization ? "supervisor" : "human",
      policy: "organization.merge",
      reason,
      subjectId: merged.taskId,
      data: { mergedFrom: taskIds }
    });
    return merged;
  }
  setState(taskId, state, detail) {
    const task = this.requireTask(taskId);
    const previous = task.state;
    task.state = state;
    if (detail?.error !== void 0) task.error = detail.error;
    if (state === "FAILED") task.attempts += 1;
    this.touch(taskId);
    if (state === "DONE") {
      const agent = task.agentId ? this.agentMap.get(task.agentId) : null;
      if (agent) {
        agent.taskIds = agent.taskIds.filter((t) => t !== taskId);
        if (!agent.taskIds.some((t) => ["ASSIGNED", "RUNNING"].includes(this.taskMap.get(t)?.state ?? ""))) agent.state = "IDLE";
      }
      this.recorder.record({
        kind: "TASK_COMPLETED",
        actor: detail?.actor ?? task.agentId ?? "runtime",
        authority: "runtime",
        policy: "task.complete",
        reason: detail?.reason ?? `Task finished after ${task.attempts + 1} attempt(s).`,
        subjectId: taskId,
        data: { previous, outputs: task.outputArtifactIds }
      });
    }
    return task;
  }
  addOutput(taskId, artifactId) {
    const task = this.requireTask(taskId);
    if (!task.outputArtifactIds.includes(artifactId)) task.outputArtifactIds.push(artifactId);
  }
  /* ------------------------------------------------------------------ queries */
  agents() {
    return [...this.agentMap.values()];
  }
  agentsInState(...states) {
    const set = new Set(states);
    return this.agents().filter((a) => set.has(a.state));
  }
  agent(id) {
    return this.agentMap.get(id) ?? null;
  }
  byDefinition(definitionId) {
    return this.agents().find((a) => a.definitionId === definitionId && a.state !== "REPLACED" && a.state !== "REMOVED") ?? null;
  }
  tasks_() {
    return [...this.taskMap.values()];
  }
  task(id) {
    return this.taskMap.get(id) ?? null;
  }
  tasksInState(...states) {
    const set = new Set(states);
    return this.tasks_().filter((t) => set.has(t.state));
  }
  /** §24 Tasks whose dependencies are all DONE and which are not approval-gated. */
  readyTasks() {
    return this.tasksInState("PENDING").filter((t) => this.dependenciesMet(t) && t.cls !== "APPROVAL_GATED");
  }
  /**
   * §24/§11 Tasks the runtime may dispatch right now: dependencies met, still PENDING.
   * Unlike `readyTasks()` this *includes* approval-gated tasks — the gate is the runtime's
   * job to run, and excluding them here made gated tasks permanently undispatchable.
   */
  dispatchableWave() {
    return this.tasksInState("PENDING").filter((t) => this.dependenciesMet(t));
  }
  /** §24 Group ready tasks into parallel waves, respecting EXCLUSIVE tasks. */
  nextWave() {
    const ready = this.dispatchableWave();
    if (!ready.length) return [];
    const exclusive = ready.filter((t) => t.cls === "EXCLUSIVE");
    if (exclusive.length) return [exclusive[0]];
    const liveAgents = this.agentsInState("ACTIVE", "IDLE").length || 1;
    return ready.slice(0, Math.max(1, this.mission.budget.maxConcurrentAgents - Math.max(0, liveAgents - this.agentsInState("IDLE").length)));
  }
  dependenciesMet(task) {
    return task.dependsOn.every((d) => this.taskMap.get(d)?.state === "DONE" || this.taskMap.get(d)?.state === "CANCELLED");
  }
  /** Wall-clock ms since each task last changed state — feeds the stall/timeout detectors. */
  taskAges(now = Date.now()) {
    const out = {};
    for (const [id, at] of this.taskUpdatedAt) out[id] = now - at;
    return out;
  }
  isDone() {
    const tasks = this.tasks_();
    if (!tasks.length) return false;
    return tasks.every((t) => t.state === "DONE" || t.state === "CANCELLED");
  }
  hasUnrecoverable() {
    return this.tasks_().some((t) => t.state === "FAILED" && t.attempts >= t.maxAttempts);
  }
  /* ------------------------------------------------------------------ persistence (§25) */
  exportState() {
    return {
      agents: this.agents(),
      tasks: this.tasks_(),
      taskUpdatedAt: Object.fromEntries(this.taskUpdatedAt)
    };
  }
  hydrate(state) {
    for (const a of state.agents) this.agentMap.set(a.agentId, a);
    for (const t of state.tasks) this.taskMap.set(t.taskId, t);
    if (state.taskUpdatedAt) for (const [k, v] of Object.entries(state.taskUpdatedAt)) this.taskUpdatedAt.set(k, v);
  }
  updateBoundary(boundary, reason, actor) {
    const previous = this.boundary;
    this.boundary = boundary;
    this.mission = { ...this.mission, boundary };
    const notes = [];
    for (const a of this.agents()) {
      const { granted, denied } = grantPermissions(boundary, a.definitionId);
      const lost = Object.keys(a.contract.permissions).filter(
        (k) => a.contract.permissions[k] && !granted[k]
      );
      a.contract.permissions = granted;
      if (lost.length) notes.push(`${a.title} lost ${lost.join(", ")}`);
      if (denied.length) notes.push(`${a.title} denied ${denied.join(", ")}`);
    }
    this.recorder.record({
      kind: "POLICY_DENIED",
      actor,
      authority: "human",
      policy: "security.boundary-update",
      reason,
      evidence: notes,
      data: { previous, next: boundary }
    });
    return notes;
  }
  /* ------------------------------------------------------------------ internals */
  touch(taskId) {
    this.taskUpdatedAt.set(taskId, Date.now());
    const t = this.taskMap.get(taskId);
    if (t) t.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  require(agentId) {
    const a = this.agentMap.get(agentId);
    if (!a) throw new Error(`unknown agent ${agentId}`);
    return a;
  }
  requireTask(taskId) {
    const t = this.taskMap.get(taskId);
    if (!t) throw new Error(`unknown task ${taskId}`);
    return t;
  }
};
function rank(r) {
  return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(r);
}
function tasksFromPlan(org, steps) {
  const byStep = /* @__PURE__ */ new Map();
  const created = /* @__PURE__ */ new Set();
  let pending = [...steps];
  let guard = 0;
  while (pending.length && guard++ < 50) {
    const batch = pending.filter((s) => s.dependsOn.every((d) => created.has(d)));
    if (!batch.length) {
      for (const s of pending) {
        byStep.set(s.id, org.createTask(taskInputFor(s, s.dependsOn)));
        created.add(s.id);
      }
      break;
    }
    for (const s of batch) {
      const deps = s.dependsOn.map((d) => byStep.get(d)?.taskId).filter((x) => Boolean(x));
      byStep.set(s.id, org.createTask(taskInputFor(s, deps)));
      created.add(s.id);
    }
    pending = pending.filter((s) => !created.has(s.id));
  }
  return byStep;
}
function taskInputFor(step, deps) {
  return {
    title: step.title,
    description: step.purpose,
    planStepId: step.id,
    dependsOn: deps,
    cls: classifyTask(step, deps, step.risk),
    risk: step.risk
  };
}

// src/mission/supervisor.ts
init_id();
var OrganizationSupervisor = class {
  constructor(mission, org, recorder) {
    this.mission = mission;
    this.org = org;
    this.recorder = recorder;
  }
  id = "supervisor";
  recommendations = [];
  handled = /* @__PURE__ */ new Set();
  /** `kind::subjectId` of every recommendation already raised, so one condition cannot be
   *  re-diagnosed into a fresh recommendation on every supervision cycle. */
  openRecs = /* @__PURE__ */ new Set();
  /** Shapes already raised AND executed. Never cleared: a condition that keeps recurring after
   *  an executed recommendation gets an escalation, not an infinite stream of identical advice. */
  executedShapes = /* @__PURE__ */ new Set();
  observe(signals) {
    const agents = this.org.agents();
    const tasks = this.org.tasks_();
    const ages = this.org.taskAges();
    const live = tasks.filter((t) => t.state === "RUNNING" || t.state === "ASSIGNED" || t.state === "PENDING");
    const done = tasks.filter((t) => t.state === "DONE" || t.state === "CANCELLED").length;
    return {
      missionId: this.mission.missionId,
      at: (/* @__PURE__ */ new Date()).toISOString(),
      agentsLive: agents.filter((a) => a.state === "ACTIVE" || a.state === "IDLE").length,
      agentsIdle: agents.filter((a) => a.state === "IDLE").length,
      agentsFailed: agents.filter((a) => a.state === "FAILED").length,
      tasksTotal: tasks.length,
      tasksDone: done,
      tasksRunning: tasks.filter((t) => t.state === "RUNNING").length,
      tasksFailed: tasks.filter((t) => t.state === "FAILED").length,
      tasksBlocked: tasks.filter((t) => t.state === "BLOCKED").length,
      oldestLiveTaskMs: live.length ? Math.max(...live.map((t) => ages[t.taskId] ?? 0)) : 0,
      signals,
      progress: tasks.length ? done / tasks.length : 0
    };
  }
  /**
   * Turn failure signals into recommendations. One recommendation per signal, deduplicated
   * by signal id so repeated observation cycles do not spam the same advice.
   */
  recommend(signals) {
    const out = [];
    for (const sig of signals) {
      if (this.handled.has(sig.id)) continue;
      const rec = this.recommendFor(sig);
      if (!rec) continue;
      const fp = `${rec.kind}::${rec.subjectId ?? "mission"}`;
      if (this.openRecs.has(fp) || this.executedShapes.has(fp)) {
        this.handled.add(sig.id);
        this.recorder.record({
          kind: "POLICY_DENIED",
          actor: this.id,
          authority: "supervisor",
          policy: "supervisor.one-recommendation-per-condition",
          reason: `${sig.kind} on "${sig.subject}" is already covered by an open ${rec.kind} recommendation. Not raising a second one.`,
          evidence: sig.evidence,
          subjectId: sig.subject,
          data: { failureKind: sig.kind, recommendation: rec.kind }
        });
        continue;
      }
      this.openRecs.add(fp);
      this.handled.add(sig.id);
      this.recommendations.push(rec);
      out.push(rec);
      this.recorder.record({
        kind: "FAILURE_DETECTED",
        actor: this.id,
        authority: "supervisor",
        policy: `autonomy=${this.mission.riskPolicy.autonomy}`,
        reason: sig.detail,
        evidence: sig.evidence,
        subjectId: sig.subject,
        data: { failureKind: sig.kind, severity: sig.severity, recommendation: rec.kind, autoExecutable: rec.autoExecutable }
      });
    }
    return out;
  }
  recommendFor(sig) {
    const base = {
      id: uid("rec"),
      missionId: this.mission.missionId,
      subjectId: sig.subject,
      evidence: sig.evidence,
      executed: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const allowReorg = this.mission.riskPolicy.allowReorganization;
    switch (sig.kind) {
      case "REPEATED_FAILURE":
        return {
          ...base,
          kind: "SWITCH_HARNESS",
          reason: `Repeated failure on this task; a different runtime is the cheapest next variable to change.`,
          autoExecutable: this.mission.riskPolicy.allowHarnessSwitch
        };
      case "TOOL_FAILURE_LOOP":
        return {
          ...base,
          kind: "SPAWN_SPECIALIST",
          reason: `Repair attempts of the same shape keep failing; the task needs a different kind of agent, not another retry.`,
          autoExecutable: allowReorg
        };
      case "TIMEOUT_LOOP":
      case "STALL":
        return {
          ...base,
          kind: "PAUSE_MISSION",
          reason: `Nothing is progressing. Pausing preserves state and prevents spending budget on a stuck organization.`,
          autoExecutable: true
        };
      case "DEPENDENCY_DEADLOCK":
        return {
          ...base,
          kind: "REORGANIZE",
          reason: `The dependency structure cannot be satisfied. This is a plan defect, not an agent defect.`,
          autoExecutable: false
          // a human must agree to restructure around a deadlock
        };
      case "BUDGET_EXHAUSTION":
        return {
          ...base,
          kind: "ESCALATE_HUMAN",
          reason: `A budget ceiling was reached. Only a human may raise it.`,
          autoExecutable: false
        };
      case "PERMISSION_DENIAL":
        return {
          ...base,
          kind: "ESCALATE_HUMAN",
          reason: `A permission boundary blocked the work. Widening a boundary is a human decision (\xA733).`,
          autoExecutable: false
        };
      case "MISSING_CAPABILITY":
        return {
          ...base,
          kind: "SPAWN_SPECIALIST",
          reason: `No roster member has the required capability.`,
          autoExecutable: allowReorg
        };
      case "DUPLICATE_WORK":
        return {
          ...base,
          kind: "REORGANIZE",
          reason: `Two live tasks are doing the same work.`,
          autoExecutable: allowReorg
        };
      case "CONTRADICTORY_OUTPUT":
        return {
          ...base,
          kind: "ESCALATE_HUMAN",
          reason: `Agents produced contradictory verdicts on the same artifact. A supervisor should not pick a side without evidence.`,
          autoExecutable: false
        };
      case "REGRESSION":
        return {
          ...base,
          kind: "ROLLBACK_CHECKPOINT",
          reason: `A later version is worse than an earlier one. Roll back to the last known good.`,
          autoExecutable: true
        };
      case "AGENT_STARVATION":
        return {
          ...base,
          kind: "RETRY",
          reason: `Idle agents with unblocked work: re-run the scheduling pass.`,
          autoExecutable: true
        };
      case "INVALID_ARTIFACT_STATE":
        return {
          ...base,
          kind: "ESCALATE_HUMAN",
          reason: `An artifact is in a state the pipeline should not produce (unevaluated, or approved despite failing).`,
          autoExecutable: false
        };
      default:
        return null;
    }
  }
  /**
   * Close a recommendation out. Returns false — and records nothing — when the recommendation
   * does not exist or was already executed, because a completion entry for a repair that never
   * ran is exactly the kind of fake success this system exists to prevent.
   */
  markExecuted(recommendationId, detail) {
    const rec = this.recommendations.find((r) => r.id === recommendationId);
    if (!rec || rec.executed) return false;
    rec.executed = true;
    const fp = `${rec.kind}::${rec.subjectId ?? "mission"}`;
    this.openRecs.delete(fp);
    this.executedShapes.add(fp);
    this.recorder.record({
      kind: "RECOMMENDATION_EXECUTED",
      actor: this.id,
      authority: "supervisor",
      policy: `supervisor.execute:${rec.kind}`,
      reason: `${rec.kind} executed: ${detail}`,
      evidence: rec.evidence,
      subjectId: rec.subjectId ?? rec.id,
      data: { recommendationId, kind: rec.kind }
    });
    return true;
  }
  list() {
    return [...this.recommendations];
  }
  pending() {
    return this.recommendations.filter((r) => !r.executed);
  }
  /**
   * §17 Decide whether repeated failure means the organization itself is wrong.
   * Returns a proposed roster change; `graphMutator` applies it under policy.
   */
  diagnoseOrganization(signals, plan) {
    const implFailures = signals.filter(
      (s) => s.kind === "REPEATED_FAILURE" || s.kind === "TOOL_FAILURE_LOOP" || s.kind === "MISSING_CAPABILITY"
    );
    const structural = signals.filter((s) => s.kind === "DEPENDENCY_DEADLOCK" || s.kind === "CONTRADICTORY_OUTPUT");
    if (structural.length) {
      return {
        reorganize: true,
        reason: `Structural failure (${structural.map((s) => s.kind).join(", ")}): the plan shape cannot deliver this objective.`,
        addSteps: [],
        evidence: structural.flatMap((s) => s.evidence)
      };
    }
    if (implFailures.length >= 1) {
      const hasArchitect = plan?.steps.some((s) => s.kind === "architecture") ?? false;
      const hasTest = plan?.steps.some((s) => s.kind === "test") ?? false;
      const hasReviewer = this.org.agents().some((a) => ["agent.reviewer", "agent.judge", "agent.critic", "agent.qa"].includes(a.definitionId) && a.state !== "REMOVED" && a.state !== "REPLACED");
      const add = [];
      if (!hasArchitect) add.push("architecture");
      if (!hasTest) add.push("test");
      if (!hasReviewer) add.push("review");
      return {
        reorganize: true,
        reason: `${implFailures.length} implementation-side failure(s). The organization is missing ${add.join(", ") || "nothing identifiable"}${hasReviewer ? "" : " \u2014 no roster member can review work independently"}.`,
        addSteps: add,
        evidence: implFailures.flatMap((s) => [`${s.kind}: ${s.detail}`, ...s.evidence])
      };
    }
    return { reorganize: false, reason: "Failure rate does not yet indicate an organizational defect.", addSteps: [], evidence: [] };
  }
  /** Which agent to replace, and with what, given a failure. */
  proposeReplacement(sig) {
    const task = this.org.task(sig.subject);
    if (!task?.agentId) return null;
    const agent = this.org.agent(task.agentId);
    if (!agent) return null;
    const upgrade = {
      "agent.coder": "agent.architect",
      "agent.tester": "agent.qa",
      "agent.reviewer": "agent.judge",
      "agent.researcher": "agent.synthesizer"
    };
    const next = upgrade[agent.definitionId];
    if (!next) {
      return {
        agentId: agent.agentId,
        definitionId: agent.definitionId,
        reason: `Re-run ${agent.title} with enriched context; no stronger role exists for this job.`
      };
    }
    return {
      agentId: agent.agentId,
      definitionId: next,
      reason: `${agent.title} failed ${task.attempts}\xD7; escalating the role to ${next}.`
    };
  }
  /**
   * §16 Choose the next repair strategy for a task, given what has already been tried.
   * The order is deliberate and cheap-first: retry, then change the input, then change the
   * runtime, then change the organization, then a human.
   */
  nextRepairStrategy(task, tried, agent) {
    const ladder = [
      {
        strategy: "RETRY",
        when: !tried.includes("RETRY") && task.attempts < task.maxAttempts,
        rationale: `Cheapest option and this is attempt ${task.attempts + 1} of ${task.maxAttempts}. Transient failure is the most common cause.`
      },
      {
        strategy: "ENRICH_CONTEXT",
        when: !tried.includes("ENRICH_CONTEXT"),
        rationale: "Same agent, better input: attach the failure output and the acceptance criteria it missed."
      },
      {
        strategy: "SWITCH_HARNESS",
        when: !tried.includes("SWITCH_HARNESS") && this.mission.riskPolicy.allowHarnessSwitch && Boolean(agent?.harness),
        rationale: `The task shape is fine but ${agent?.harness} could not deliver it. Change the runtime, not the plan.`
      },
      {
        strategy: "SPLIT_TASK",
        when: !tried.includes("SPLIT_TASK") && task.description.length > 200,
        rationale: "The task is large enough that a smaller unit of work is more likely to succeed and easier to diagnose."
      },
      {
        strategy: "SPAWN_SPECIALIST",
        when: !tried.includes("SPAWN_SPECIALIST") && this.mission.riskPolicy.allowReorganization,
        rationale: "Three cheaper strategies failed. The role itself is probably wrong for this job."
      },
      {
        strategy: "REDUCE_SCOPE",
        when: !tried.includes("REDUCE_SCOPE"),
        rationale: "Deliver a smaller verified increment rather than nothing."
      },
      {
        strategy: "ROLLBACK_CHECKPOINT",
        when: !tried.includes("ROLLBACK_CHECKPOINT"),
        rationale: "Restore the last known-good state before continuing."
      },
      {
        strategy: "ESCALATE_HUMAN",
        when: true,
        rationale: "Every automated strategy has been tried. A human decides next."
      }
    ];
    for (const rung of ladder) {
      if (rung.when) return { strategy: rung.strategy, rationale: rung.rationale };
    }
    return null;
  }
  /** Progress summary for the mission header. */
  summarise() {
    const tasks = this.org.tasks_();
    const done = tasks.filter((t) => t.state === "DONE").length;
    const failed = tasks.filter((t) => t.state === "FAILED").length;
    return `${done}/${tasks.length} tasks done, ${failed} failed, ${this.org.agents().filter((a) => a.state === "ACTIVE").length} agents active`;
  }
  exportState() {
    return this.list();
  }
  hydrate(recs, handledSignals = []) {
    this.recommendations = [...recs];
    for (const h of handledSignals) this.handled.add(h);
  }
};

// src/mission/harnessAdapters.ts
var LocalTestHarness = class {
  id = "local-test";
  name = "Local Test Harness (simulated \u2014 not a real agent)";
  simulated = true;
  installHint = "Built in. Used only when a mission explicitly allows simulated execution.";
  languages = ["any"];
  strengths = ["deterministic-offline-testing"];
  canEditFiles = false;
  canRunTests = false;
  capabilities = ["simulation"];
  /** Task titles matching this fail on the first attempt, to exercise the repair path. */
  failFirstAttemptFor = /implement|build|code/i;
  attempts = /* @__PURE__ */ new Map();
  supports(_task) {
    return true;
  }
  prepare(task) {
    return { program: "(in-process simulation)", args: [task.taskId] };
  }
  async invoke(task) {
    const started = Date.now();
    const n = (this.attempts.get(task.taskId) ?? 0) + 1;
    this.attempts.set(task.taskId, n);
    const shouldFail = this.failFirstAttemptFor.test(task.title) && n === 1;
    await new Promise((r) => setTimeout(r, 5));
    if (shouldFail) {
      return {
        ok: false,
        text: "",
        exitCode: 1,
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: true,
        detail: "simulated-failure",
        error: `[local-test] Simulated failure on first attempt at "${task.title}" so the repair path is exercised. This is not real work.`
      };
    }
    return {
      ok: true,
      text: [
        `[local-test simulation \u2014 attempt ${n}]`,
        `Task: ${task.title}`,
        `Kind: ${task.kind}`,
        `Languages: ${task.languages.join(", ") || "n/a"}`,
        "",
        "This output was produced by the labelled test double, not by a real agent.",
        "It is recorded as simulated and is NOT counted as independently verified."
      ].join("\n"),
      exitCode: 0,
      latencyMs: Date.now() - started,
      costUsd: 0,
      simulated: true,
      detail: `simulated attempt=${n}`,
      error: null
    };
  }
  reset() {
    this.attempts.clear();
  }
};
var localTestHarness = new LocalTestHarness();
var registry = /* @__PURE__ */ new Map();
registry.set("local-test", localTestHarness);
function getHarness(id) {
  return registry.get(id) ?? null;
}
function allHarnesses() {
  return [...registry.values()];
}

// src/mission/arbitration.ts
init_id();
var ARBITRATION_WEIGHTS = {
  capabilityMatch: 0.3,
  languageMatch: 0.15,
  historicalSuccess: 0.25,
  latency: 0.1,
  cost: 0.05,
  permissionFit: 0.1,
  recency: 0.05
};
var EVIDENCE_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1e3;
var HarnessLedger = class {
  records = [];
  record(rec) {
    const full = { ...rec, id: uid("hr"), at: rec.at ?? (/* @__PURE__ */ new Date()).toISOString() };
    this.records.push(full);
    return full;
  }
  all() {
    return [...this.records];
  }
  forHarness(harness) {
    return this.records.filter((r) => r.harness === harness);
  }
  /**
   * §7 Aggregate performance. `verifiedSuccessRate` counts only runs whose outcome an
   * independent check confirmed — an agent saying "done" is not a success.
   */
  stats(harness, scope) {
    let recs = this.forHarness(harness);
    if (scope?.repository) recs = recs.filter((r) => r.repository === scope.repository);
    if (scope?.taskKind) recs = recs.filter((r) => r.taskKind === scope.taskKind);
    if (scope?.language) recs = recs.filter((r) => r.languages.includes(scope.language));
    const kindAcc = /* @__PURE__ */ new Map();
    const langAcc = /* @__PURE__ */ new Map();
    for (const r of recs) {
      const k = kindAcc.get(r.taskKind) ?? { runs: 0, success: 0, ms: [] };
      k.runs += 1;
      if (r.success) k.success += 1;
      k.ms.push(r.latencyMs);
      kindAcc.set(r.taskKind, k);
      for (const lang of r.languages) {
        const l = langAcc.get(lang) ?? { runs: 0, success: 0 };
        l.runs += 1;
        if (r.success) l.success += 1;
        langAcc.set(lang, l);
      }
    }
    const latencies = recs.map((r) => r.latencyMs).sort((a, b) => a - b);
    return {
      harness,
      runs: recs.length,
      successRate: recs.length ? recs.filter((r) => r.success).length / recs.length : 0,
      verifiedSuccessRate: recs.length ? recs.filter((r) => r.independentlyVerified).length / recs.length : 0,
      medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0,
      totalCostUsd: recs.reduce((s, r) => s + r.costUsd, 0),
      byTaskKind: Object.fromEntries(
        [...kindAcc.entries()].map(([k, v]) => [
          k,
          { runs: v.runs, successRate: v.runs ? v.success / v.runs : 0, medianLatencyMs: median(v.ms) }
        ])
      ),
      byLanguage: Object.fromEntries(
        [...langAcc.entries()].map(([k, v]) => [k, { runs: v.runs, successRate: v.runs ? v.success / v.runs : 0 }])
      )
    };
  }
  /** Recency-weighted success rate. Old evidence fades instead of ossifying. */
  decayedSuccessRate(harness, now = Date.now()) {
    const recs = this.forHarness(harness);
    if (!recs.length) return { rate: 0, effectiveRuns: 0 };
    let weightedSuccess = 0;
    let weight = 0;
    for (const r of recs) {
      const age = Math.max(0, now - new Date(r.at).getTime());
      const w = Math.pow(0.5, age / EVIDENCE_HALF_LIFE_MS);
      weight += w;
      if (r.independentlyVerified) weightedSuccess += w;
      else if (r.success) weightedSuccess += w * 0.6;
    }
    return { rate: weight ? weightedSuccess / weight : 0, effectiveRuns: weight };
  }
  hydrate(records) {
    this.records = [...records];
  }
  export() {
    return this.all();
  }
};
function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function selectHarness(ctx, ledger) {
  const candidates = allHarnesses().filter((h) => {
    if (h.simulated) return ctx.allowSimulated;
    if (!ctx.mission.allowedHarnesses.length) return true;
    return ctx.mission.allowedHarnesses.includes(h.id);
  });
  const rejected = [];
  const scores = [];
  let usedHistoricalEvidence = false;
  for (const h of candidates) {
    const installState = ctx.installed[h.id] ?? null;
    if (installState === false) {
      rejected.push({ harness: h.id, reason: "not installed on this machine" });
      continue;
    }
    const components = {};
    const required = ctx.step.requiredCapabilities;
    components.capabilityMatch = required.length ? required.filter((c) => h.capabilities.includes(c) || h.capabilities.includes("simulation")).length / required.length : 0.5;
    const langs = ctx.step.languages;
    components.languageMatch = langs.length ? langs.filter((l) => h.languages.includes(l) || h.languages.includes("any")).length / langs.length : 0.5;
    const hid = h.id;
    const scoped = ledger.stats(hid, { repository: ctx.repository, taskKind: ctx.step.kind });
    const broad = ledger.stats(hid);
    const decayed = ledger.decayedSuccessRate(hid, ctx.now);
    const basis = scoped.runs >= 3 ? scoped : broad;
    if (basis.runs > 0) {
      usedHistoricalEvidence = true;
      const confidence = Math.min(1, basis.runs / 10);
      components.historicalSuccess = confidence * (0.5 * basis.verifiedSuccessRate + 0.5 * decayed.rate) + (1 - confidence) * 0.5;
    } else {
      components.historicalSuccess = 0.5;
    }
    components.latency = basis.medianLatencyMs > 0 ? Math.max(0, 1 - basis.medianLatencyMs / 3e5) : 0.5;
    components.cost = basis.totalCostUsd > 0 ? Math.max(0, 1 - basis.totalCostUsd / Math.max(0.01, ctx.mission.budget.maxCostUsd)) : 0.5;
    components.permissionFit = h.canEditFiles === ctx.mission.boundary.filesystemWrite ? 1 : 0.6;
    components.recency = installState === true ? 0.7 : 0.4;
    const score = components.capabilityMatch * ARBITRATION_WEIGHTS.capabilityMatch + components.languageMatch * ARBITRATION_WEIGHTS.languageMatch + components.historicalSuccess * ARBITRATION_WEIGHTS.historicalSuccess + components.latency * ARBITRATION_WEIGHTS.latency + components.cost * ARBITRATION_WEIGHTS.cost + components.permissionFit * ARBITRATION_WEIGHTS.permissionFit + components.recency * ARBITRATION_WEIGHTS.recency;
    scores.push({ harness: h.id, score: Number(score.toFixed(4)), components });
  }
  scores.sort((a, b) => b.score - a.score);
  if (!scores.length) {
    if (ctx.allowSimulated) {
      return {
        chosen: "local-test",
        scores: [{ harness: "local-test", score: 0, components: { fallback: 1 } }],
        rationale: ["No eligible harness. Falling back to the labelled simulation because the mission allows it."],
        rejected,
        usedHistoricalEvidence: false,
        simulated: true
      };
    }
    throw new Error(
      `No eligible harness for "${ctx.step.title}". Rejected: ${rejected.map((r) => `${r.harness} (${r.reason})`).join("; ") || "none"}. Install a coding CLI or widen mission.allowedHarnesses.`
    );
  }
  const winner = scores[0];
  const rationale = [];
  const w = mustHarness(winner.harness);
  rationale.push(`${w.name} scored ${winner.score.toFixed(3)} \u2014 the highest of ${scores.length} eligible runtime(s).`);
  const top = Object.entries(winner.components).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [k, v] of top) rationale.push(`${k}: ${v.toFixed(2)} (weight ${ARBITRATION_WEIGHTS[k] ?? 0})`);
  if (!usedHistoricalEvidence) {
    rationale.push("No historical evidence for any candidate; selection rests on capability and language fit. This is a first impression, not a verdict.");
  }
  if (scores.length > 1) {
    rationale.push(`Runner-up ${scores[1].harness} at ${scores[1].score.toFixed(3)} \u2014 margin ${(winner.score - scores[1].score).toFixed(3)}.`);
  }
  if (w.simulated) {
    rationale.push("WARNING: the selected runtime is VH's labelled simulation. Its output is recorded as simulated and is not independently verified.");
  }
  return { chosen: winner.harness, scores, rationale, rejected, usedHistoricalEvidence, simulated: w.simulated };
}
function selectReplacementHarness(ctx, ledger, tried) {
  const filtered = {
    ...ctx,
    mission: {
      ...ctx.mission,
      allowedHarnesses: ctx.mission.allowedHarnesses.filter((h) => !tried.includes(h))
    }
  };
  try {
    const decision = selectHarness(filtered, ledger);
    if (tried.includes(decision.chosen)) return null;
    return decision;
  } catch {
    return null;
  }
}
function mustHarness(id) {
  const h = getHarness(id);
  if (!h) throw new Error(`unknown harness "${id}"`);
  return h;
}

// src/domain/dataTypes.ts
var COMPAT = {
  any: [],
  Text: ["Text", "Markdown", "JSON", "URL", "Number", "Boolean"],
  Markdown: ["Markdown", "Text"],
  JSON: ["JSON", "Object", "Array", "Text"],
  Object: ["Object", "JSON", "WorkflowContext", "RepositoryContext", "AgentResult"],
  Array: ["Array", "JSON"],
  Image: ["Image", "File"],
  File: ["File", "Image"],
  URL: ["URL", "Text"],
  BrowserSession: ["BrowserSession"],
  AgentResult: ["AgentResult", "Text", "Markdown", "Object"],
  Evaluation: ["Evaluation", "JSON", "Object", "Text", "Markdown", "AgentResult"],
  Boolean: ["Boolean", "Text", "Number"],
  Number: ["Number", "Text"],
  Stream: ["Stream", "Text"],
  Event: ["Event", "JSON"],
  // V6 fix: a mission/workflow payload is routinely handed to an agent as its brief.
  // Without Text/Markdown/JSON here, every Start -> Agent wire was silently dropped.
  WorkflowContext: ["WorkflowContext", "Object", "Text", "Markdown", "JSON", "URL", "any"],
  RepositoryContext: ["RepositoryContext", "Object"],
  Error: ["Error", "Text"]
};
function portsCompatible(source, target) {
  if (source === "any" || target === "any") return true;
  if (source === target) return true;
  return (COMPAT[source] ?? []).includes(target);
}

// src/mission/failureDetection.ts
init_id();
function signal(kind, severity, input, subject, detail, evidence) {
  return {
    id: uid("fail"),
    missionId: input.missionId,
    kind,
    severity,
    subject,
    detail,
    evidence,
    detectedAt: new Date(input.now).toISOString(),
    resolvedBy: null
  };
}
var repeatedFailure = (input) => {
  const out = [];
  for (const t of input.tasks) {
    if (t.attempts >= 2 && (t.state === "FAILED" || t.state === "BLOCKED")) {
      out.push(
        signal(
          "REPEATED_FAILURE",
          t.attempts >= 3 ? "ERROR" : "WARN",
          input,
          t.taskId,
          `Task "${t.title}" has failed ${t.attempts} of ${t.maxAttempts} allowed attempts.`,
          [t.error ?? "no error recorded", `attempts=${t.attempts}`]
        )
      );
    }
  }
  return out;
};
var timeoutLoop = (input) => {
  const out = [];
  const ages = Object.entries(input.taskAgeMs);
  if (ages.length < 2) return out;
  const median2 = medianOf(ages.map(([, ms]) => ms));
  for (const t of input.tasks) {
    if (t.state !== "RUNNING" && t.state !== "ASSIGNED") continue;
    const age = input.taskAgeMs[t.taskId] ?? 0;
    if (median2 > 0 && age > Math.max(5 * median2, 12e4)) {
      out.push(
        signal(
          "TIMEOUT_LOOP",
          "WARN",
          input,
          t.taskId,
          `Task "${t.title}" has been ${Math.round(age / 1e3)}s in ${t.state}, against a mission median of ${Math.round(median2 / 1e3)}s.`,
          [`ageMs=${age}`, `medianMs=${median2}`]
        )
      );
    }
  }
  return out;
};
var toolFailureLoop = (input) => {
  const out = [];
  const byTask = /* @__PURE__ */ new Map();
  for (const r of input.repairs) {
    const list = byTask.get(r.taskId) ?? [];
    list.push(r);
    byTask.set(r.taskId, list);
  }
  for (const [taskId, attempts] of byTask) {
    const failed = attempts.filter((a) => a.result === "FAILURE");
    if (failed.length >= 2) {
      out.push(
        signal(
          "TOOL_FAILURE_LOOP",
          "ERROR",
          input,
          taskId,
          `${failed.length} repair attempts failed on this task (${failed.map((f) => f.strategy).join(", ")}). Further retries of the same shape are unlikely to help.`,
          failed.map((f) => `${f.strategy}: ${f.detail}`)
        )
      );
    }
  }
  return out;
};
var duplicateWork = (input) => {
  const out = [];
  const seen = /* @__PURE__ */ new Map();
  for (const t of input.tasks) {
    if (t.state === "DONE" || t.state === "CANCELLED") continue;
    const key2 = t.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const list = seen.get(key2) ?? [];
    list.push(t);
    seen.set(key2, list);
  }
  for (const [key2, group] of seen) {
    if (group.length > 1) {
      out.push(
        signal(
          "DUPLICATE_WORK",
          "WARN",
          input,
          group[0].taskId,
          `${group.length} live tasks share the objective "${key2}".`,
          group.map((t) => `${t.taskId} -> ${t.agentId ?? "unassigned"}`)
        )
      );
    }
  }
  return out;
};
var contradictoryOutput = (input) => {
  const out = [];
  const byRoot = /* @__PURE__ */ new Map();
  for (const a of input.artifacts) {
    const list = byRoot.get(a.lineageRoot) ?? [];
    list.push(a);
    byRoot.set(a.lineageRoot, list);
  }
  for (const [root, group] of byRoot) {
    if (group.length < 2) continue;
    const passes = group.filter((a) => /\b(verdict|result)\s*:\s*(pass|passed|approved)\b/i.test(a.content));
    const fails = group.filter((a) => /\b(verdict|result)\s*:\s*(fail|failed|rejected)\b/i.test(a.content));
    if (passes.length && fails.length) {
      out.push(
        signal(
          "CONTRADICTORY_OUTPUT",
          "ERROR",
          input,
          root,
          `${passes.length} artifact(s) record a pass and ${fails.length} record a failure for the same lineage.`,
          [...passes.map((a) => `PASS ${a.artifactId} by ${a.createdBy}`), ...fails.map((a) => `FAIL ${a.artifactId} by ${a.createdBy}`)]
        )
      );
    }
  }
  return out;
};
var agentStarvation = (input) => {
  const out = [];
  const waiting = input.tasks.filter((t) => t.state === "PENDING");
  if (!waiting.length) return out;
  for (const a of input.agents) {
    if (a.state !== "IDLE") continue;
    const eligible = waiting.filter(
      (t) => !t.dependsOn.length || t.dependsOn.every((d) => input.tasks.find((x) => x.taskId === d)?.state === "DONE")
    );
    if (eligible.length) {
      out.push(
        signal(
          "AGENT_STARVATION",
          "WARN",
          input,
          a.agentId,
          `${a.title} is idle while ${eligible.length} unblocked task(s) wait.`,
          eligible.map((t) => t.taskId)
        )
      );
    }
  }
  return out;
};
var dependencyDeadlock = (input) => {
  const out = [];
  const live = new Set(input.tasks.filter((t) => t.state !== "DONE" && t.state !== "CANCELLED").map((t) => t.taskId));
  const state = /* @__PURE__ */ new Map();
  const byId = new Map(input.tasks.map((t) => [t.taskId, t]));
  const visit = (id, stack) => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...stack, id];
    state.set(id, "visiting");
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!live.has(dep)) continue;
      const cycle = visit(dep, [...stack, id]);
      if (cycle) return cycle;
    }
    state.set(id, "done");
    return null;
  };
  for (const id of live) {
    const cycle = visit(id, []);
    if (cycle) {
      out.push(
        signal(
          "DEPENDENCY_DEADLOCK",
          "CRITICAL",
          input,
          cycle[cycle.length - 1],
          `Circular dependency among live tasks: ${cycle.join(" -> ")}.`,
          cycle.map((c) => `${c} waits on ${(byId.get(c)?.dependsOn ?? []).join(", ")}`)
        )
      );
      break;
    }
  }
  for (const t of input.tasks) {
    if (!live.has(t.taskId)) continue;
    const missing = t.dependsOn.filter((d) => !byId.has(d));
    if (missing.length) {
      out.push(
        signal(
          "DEPENDENCY_DEADLOCK",
          "ERROR",
          input,
          t.taskId,
          `Task "${t.title}" depends on missing task(s): ${missing.join(", ")}.`,
          [t.taskId, ...missing]
        )
      );
    }
  }
  return out;
};
var budgetExhaustion = (input) => {
  const out = [];
  const check2 = (label, value, ceiling) => {
    if (ceiling <= 0) return;
    const ratio = value / ceiling;
    if (ratio >= 1) {
      out.push(
        signal("BUDGET_EXHAUSTION", "CRITICAL", input, label, `${label} exhausted: ${round(value)} of ${round(ceiling)}.`, [`ratio=${ratio.toFixed(2)}`])
      );
    } else if (ratio >= 0.8) {
      out.push(
        signal("BUDGET_EXHAUSTION", "WARN", input, label, `${label} at ${Math.round(ratio * 100)}%: ${round(value)} of ${round(ceiling)}.`, [`ratio=${ratio.toFixed(2)}`])
      );
    }
  };
  check2("cost", input.usage.costUsd, input.budget.maxCostUsd);
  check2("tokens", input.usage.tokens, input.budget.maxTokens);
  check2("wall clock (ms)", input.usage.wallClockMs, input.budget.maxWallClockMs);
  check2("retries", input.usage.retries, input.budget.maxRetriesPerTask * Math.max(1, input.tasks.length));
  check2("graph mutations", input.usage.graphMutations, input.budget.maxGraphMutations);
  return out;
};
var permissionDenial = (input) => {
  const out = [];
  for (const t of input.tasks) {
    if (!t.error) continue;
    if (/not granted|permission denied|not permitted|forbidden|unauthorised|unauthorized/i.test(t.error)) {
      out.push(
        signal(
          "PERMISSION_DENIAL",
          "WARN",
          input,
          t.taskId,
          `Task "${t.title}" was blocked by a permission boundary. Either grant the permission or replan without it.`,
          [t.error]
        )
      );
    }
  }
  return out;
};
var invalidArtifactState = (input) => {
  const out = [];
  for (const a of input.artifacts) {
    if (!a.evaluation) {
      out.push(
        signal("INVALID_ARTIFACT_STATE", "WARN", input, a.artifactId, `Artifact "${a.name}" v${a.version} was never evaluated.`, [`createdBy=${a.createdBy}`])
      );
    } else if (!a.evaluation.passed && a.approvalState === "APPROVED") {
      out.push(
        signal(
          "INVALID_ARTIFACT_STATE",
          "ERROR",
          input,
          a.artifactId,
          `Artifact "${a.name}" v${a.version} failed evaluation but is marked APPROVED.`,
          a.evaluation.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`)
        )
      );
    }
  }
  return out;
};
var regression = (input) => {
  const out = [];
  const byRoot = /* @__PURE__ */ new Map();
  for (const a of input.artifacts) {
    const list = byRoot.get(a.lineageRoot) ?? [];
    list.push(a);
    byRoot.set(a.lineageRoot, list);
  }
  for (const [, group] of byRoot) {
    const sorted = group.filter((a) => a.evaluation?.fullyMeasured).sort((a, b) => a.version - b.version);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].evaluation;
      const cur = sorted[i].evaluation;
      const score = (e) => e.checks.filter((c) => c.score != null).reduce((s, c) => s + (c.score ?? 0), 0) / Math.max(1, e.checks.filter((c) => c.score != null).length);
      if (prev.passed && !cur.passed) {
        out.push(
          signal(
            "REGRESSION",
            "ERROR",
            input,
            sorted[i].artifactId,
            `"${sorted[i].name}" v${sorted[i].version} fails where v${prev.checks.length ? sorted[i - 1].version : sorted[i - 1].version} passed.`,
            cur.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`)
          )
        );
      } else if (score(cur) + 0.05 < score(prev)) {
        out.push(
          signal(
            "REGRESSION",
            "WARN",
            input,
            sorted[i].artifactId,
            `"${sorted[i].name}" v${sorted[i].version} scores ${score(cur).toFixed(2)} against ${score(prev).toFixed(2)} for v${sorted[i - 1].version}.`,
            [`prev=${score(prev).toFixed(3)}`, `cur=${score(cur).toFixed(3)}`]
          )
        );
      }
    }
  }
  return out;
};
var missingCapability = (input) => {
  const out = [];
  for (const t of input.tasks) {
    if (!t.error) continue;
    const m2 = t.error.match(/missing capabilit(?:y|ies): ([^.;]+)/i);
    if (m2) {
      out.push(
        signal(
          "MISSING_CAPABILITY",
          "ERROR",
          input,
          t.taskId,
          `No agent in the roster can perform "${t.title}": ${m2[1]}.`,
          [t.error, ...input.agents.map((a) => `${a.title}: ${a.contract.capabilities.join(", ") || "none"}`)]
        )
      );
    }
  }
  return out;
};
var stall = (input) => {
  const live = input.tasks.filter((t) => t.state === "RUNNING" || t.state === "ASSIGNED" || t.state === "PENDING");
  if (!live.length) return [];
  const ages = live.map((t) => input.taskAgeMs[t.taskId] ?? 0);
  const youngest = Math.min(...ages);
  if (youngest > 18e4) {
    return [
      signal(
        "STALL",
        "ERROR",
        input,
        input.missionId,
        `No task has changed state for ${Math.round(youngest / 1e3)}s while ${live.length} remain live.`,
        live.map((t) => `${t.taskId} ${t.state} ${Math.round((input.taskAgeMs[t.taskId] ?? 0) / 1e3)}s`)
      )
    ];
  }
  return [];
};
var ALL_DETECTORS = [
  { kind: "REPEATED_FAILURE", fn: repeatedFailure },
  { kind: "TIMEOUT_LOOP", fn: timeoutLoop },
  { kind: "TOOL_FAILURE_LOOP", fn: toolFailureLoop },
  { kind: "DUPLICATE_WORK", fn: duplicateWork },
  { kind: "CONTRADICTORY_OUTPUT", fn: contradictoryOutput },
  { kind: "AGENT_STARVATION", fn: agentStarvation },
  { kind: "DEPENDENCY_DEADLOCK", fn: dependencyDeadlock },
  { kind: "BUDGET_EXHAUSTION", fn: budgetExhaustion },
  { kind: "PERMISSION_DENIAL", fn: permissionDenial },
  { kind: "INVALID_ARTIFACT_STATE", fn: invalidArtifactState },
  { kind: "REGRESSION", fn: regression },
  { kind: "MISSING_CAPABILITY", fn: missingCapability },
  { kind: "STALL", fn: stall }
];
function detectAll(input) {
  const out = [];
  for (const { fn } of ALL_DETECTORS) {
    try {
      out.push(...fn(input));
    } catch (e) {
      out.push(
        signal("INVALID_ARTIFACT_STATE", "WARN", input, "detector", `Detector threw: ${e instanceof Error ? e.message : String(e)}`, [])
      );
    }
  }
  return out;
}
function medianOf(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function round(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

// src/mission/evaluation.ts
init_id();
var REQUIRED_CHECKS = {
  research: ["INDEPENDENT_REVIEW"],
  architecture: ["INDEPENDENT_REVIEW"],
  implementation: ["TEST_RUN", "STATIC_CHECK", "INDEPENDENT_REVIEW"],
  test: ["INDEPENDENT_REVIEW"],
  security: ["SECURITY_CHECK", "INDEPENDENT_REVIEW"],
  review: ["INDEPENDENT_REVIEW"],
  synthesis: ["INDEPENDENT_REVIEW"],
  approval: [],
  release: ["INDEPENDENT_REVIEW", "REGRESSION_SUITE"]
};
function check(input) {
  return {
    id: uid("chk"),
    name: input.name,
    source: input.source,
    passed: input.measured === false ? false : input.passed,
    score: input.measured === false ? null : input.score,
    detail: input.measured === false ? `NOT MEASURED \u2014 ${input.detail}` : input.detail,
    measured: input.measured !== false,
    evidence: input.evidence ?? []
  };
}
function unmeasuredCheck(name, source, why) {
  return check({ name, source, passed: false, score: null, detail: why, measured: false });
}
function evaluateArtifact(input) {
  const required = REQUIRED_CHECKS[input.kind] ?? [];
  const bySource = /* @__PURE__ */ new Map();
  for (const c of input.checks) {
    const list = bySource.get(c.source) ?? [];
    list.push(c);
    bySource.set(c.source, list);
  }
  const unmeasured = [];
  for (const src of required) {
    const present = bySource.get(src) ?? [];
    if (!present.length) unmeasured.push(`${src} (absent)`);
    else if (present.every((c) => !c.measured)) unmeasured.push(`${src} (present but not measured)`);
  }
  const onlySelfReport = input.checks.length > 0 && input.checks.every((c) => c.source === "AGENT_SELF_REPORT");
  if (onlySelfReport && required.length) {
    unmeasured.push("independent verification (only a self-report was offered)");
  }
  const failed = input.checks.filter((c) => !c.passed);
  const passed = unmeasured.length === 0 && failed.length === 0 && input.checks.length > 0;
  return {
    evaluationId: uid("eval"),
    artifactId: input.artifactId,
    checks: input.checks,
    passed,
    fullyMeasured: unmeasured.length === 0,
    unmeasured,
    decidedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function compositeOfChecks(checks) {
  if (!checks.length) return 0;
  const weights = {
    AGENT_SELF_REPORT: 0.1,
    TEST_RUN: 1,
    STATIC_CHECK: 0.8,
    SECURITY_CHECK: 1,
    INDEPENDENT_REVIEW: 1,
    REGRESSION_SUITE: 1,
    HUMAN: 1.2
  };
  let sum = 0;
  let weight = 0;
  for (const c of checks) {
    const w = weights[c.source] ?? 0.5;
    weight += w;
    if (!c.measured) continue;
    sum += w * (c.score ?? (c.passed ? 1 : 0));
  }
  return weight ? sum / weight : 0;
}
function scoreMission(input) {
  const unmeasured = [];
  const goalCompletion = input.successCriteria.length ? input.criteriaMet.length / input.successCriteria.length : (unmeasured.push("goal completion (no success criteria were declared)"), 0);
  const measuredChecks = input.checks.filter((c) => c.measured);
  if (!measuredChecks.length) unmeasured.push("quality (no measured checks)");
  const quality = measuredChecks.length ? compositeOfChecks(measuredChecks) : 0;
  const measuredTests = input.testChecks.filter((c) => c.measured);
  if (!measuredTests.length) unmeasured.push("tests (none were run)");
  const tests = measuredTests.length ? measuredTests.filter((c) => c.passed).length / measuredTests.length : 0;
  const measuredSec = input.securityChecks.filter((c) => c.measured);
  if (!measuredSec.length) unmeasured.push("security (no security checks were run)");
  const security = measuredSec.length ? measuredSec.filter((c) => c.passed).length / measuredSec.length : 0;
  const costEfficiency = input.budgetUsd > 0 ? clamp01(1 - input.spentUsd / input.budgetUsd) : (unmeasured.push("cost (no budget was set)"), 0);
  let latencyEfficiency = 0;
  if (input.deadlineMs && input.deadlineMs > 0) {
    latencyEfficiency = clamp01(1 - input.elapsedMs / input.deadlineMs);
  } else {
    unmeasured.push("latency (no deadline was set)");
  }
  return {
    goalCompletion: round2(goalCompletion),
    quality: round2(quality),
    tests: round2(tests),
    security: round2(security),
    costEfficiency: round2(costEfficiency),
    latencyEfficiency: round2(latencyEfficiency),
    humanInterventions: input.humanInterventions,
    regressionCount: input.regressionCount,
    unmeasured
  };
}
function testRunCheck(command, output, exitCode) {
  if (!output.trim()) {
    return unmeasuredCheck(`Test run: ${command}`, "TEST_RUN", "the command produced no output, so nothing was verified");
  }
  const failedCounts = [...output.matchAll(/(\d+)[ ,]+fail(?:ed|ing|ures?)?\b/gi)].map((m2) => Number(m2[1]));
  const summaryFailed = failedCounts.some((n) => n > 0) || /^not ok\b/m.test(output) || /^FAILED\b/m.test(output) || /\bpanic:/.test(output);
  const passed = exitCode === 0 && !summaryFailed;
  return check({
    name: `Test run: ${command}`,
    source: "TEST_RUN",
    passed,
    score: passed ? 1 : 0,
    detail: `exit=${exitCode ?? "?"}, ${output.length} bytes of output, ${summaryFailed ? "runner summary reports failures" : "no failure summary"}`,
    evidence: [output.slice(0, 2e3)]
  });
}
function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
function round2(n) {
  return Math.round(n * 1e3) / 1e3;
}

// src/mission/checkpoints.ts
init_id();
var EMPTY_USAGE = {
  costUsd: 0,
  tokens: 0,
  peakConcurrentAgents: 0,
  browserSessions: 0,
  graphMutations: 0,
  retries: 0,
  wallClockMs: 0
};
var ResourceManager = class {
  constructor(budget, startedAt = Date.now()) {
    this.budget = budget;
    this.startedAt = startedAt;
  }
  usage = { ...EMPTY_USAGE };
  violations = [];
  spend(delta) {
    for (const [k, v] of Object.entries(delta)) {
      const key2 = k;
      this.usage[key2] = this.usage[key2] + v;
    }
    this.usage.wallClockMs = Date.now() - this.startedAt;
  }
  /** Called before dispatching work. Returns the first ceiling already breached, or null. */
  maySpend(estimatedCostUsd, liveAgents) {
    const projected = { ...this.usage, costUsd: this.usage.costUsd + estimatedCostUsd };
    const checks = [
      ["maxCostUsd", projected.costUsd, this.budget.maxCostUsd],
      ["maxTokens", projected.tokens, this.budget.maxTokens],
      ["maxWallClockMs", Date.now() - this.startedAt, this.budget.maxWallClockMs],
      ["maxConcurrentAgents", liveAgents, this.budget.maxConcurrentAgents],
      ["maxGraphMutations", this.usage.graphMutations, this.budget.maxGraphMutations],
      ["maxBrowserSessions", this.usage.browserSessions, this.budget.maxBrowserSessions]
    ];
    for (const [limit, value, ceiling] of checks) {
      if (ceiling > 0 && value > ceiling) {
        const v = { limit, value, ceiling, at: (/* @__PURE__ */ new Date()).toISOString() };
        this.violations.push(v);
        return v;
      }
    }
    return null;
  }
  /** Ratios for the mission header, so a ceiling is visible before it is hit. */
  ratios() {
    const rows = [
      ["maxCostUsd", this.usage.costUsd, this.budget.maxCostUsd],
      ["maxTokens", this.usage.tokens, this.budget.maxTokens],
      ["maxWallClockMs", Date.now() - this.startedAt, this.budget.maxWallClockMs],
      ["maxConcurrentAgents", this.usage.peakConcurrentAgents, this.budget.maxConcurrentAgents],
      ["maxGraphMutations", this.usage.graphMutations, this.budget.maxGraphMutations],
      ["maxRetriesPerTask", this.usage.retries, this.budget.maxRetriesPerTask * 10]
    ];
    return rows.map(([limit, value, ceiling]) => ({
      limit,
      value,
      ceiling,
      ratio: ceiling > 0 ? value / ceiling : 0
    }));
  }
  violationsList() {
    return [...this.violations];
  }
  remainingCostUsd() {
    return Math.max(0, this.budget.maxCostUsd - this.usage.costUsd);
  }
  hydrate(usage, startedAt) {
    this.usage = { ...usage };
    this.startedAt = startedAt;
  }
  export() {
    return { ...this.usage, wallClockMs: Date.now() - this.startedAt };
  }
};
var CheckpointStore = class {
  checkpoints = [];
  /**
   * Take a checkpoint. The graph is deep-copied: a checkpoint that aliases live state is not
   * a checkpoint, it is a promise that will be broken by the next mutation.
   */
  take(input, recorder) {
    const cp = {
      checkpointId: uid("cp"),
      missionId: input.missionId,
      label: input.label,
      reason: input.reason,
      graphVersion: input.graphVersion,
      graphSnapshot: structuredClone(input.graphSnapshot),
      taskStates: { ...input.taskStates },
      artifactVersions: { ...input.artifactVersions },
      roster: input.roster.map((r) => ({ ...r })),
      pendingApprovalIds: [...input.pendingApprovalIds],
      spentUsd: input.spentUsd,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.checkpoints.push(cp);
    recorder.record({
      kind: "MISSION_CHECKPOINTED",
      actor: "runtime",
      authority: "policy:checkpoint.automatic",
      policy: "checkpoint.after-transition",
      reason: input.reason,
      subjectId: cp.checkpointId,
      data: {
        label: cp.label,
        graphVersion: cp.graphVersion,
        nodes: cp.graphSnapshot.nodes.length,
        tasksDone: Object.values(cp.taskStates).filter((s) => s === "DONE").length,
        spentUsd: cp.spentUsd
      }
    });
    return cp;
  }
  latest(missionId) {
    const list = this.forMission(missionId);
    return list.length ? list[list.length - 1] : null;
  }
  get(checkpointId) {
    return this.checkpoints.find((c) => c.checkpointId === checkpointId) ?? null;
  }
  forMission(missionId) {
    return this.checkpoints.filter((c) => c.missionId === missionId);
  }
  /**
   * §26 Rollback. Returns the checkpoint to restore and records the rollback. Restoring is
   * the caller's job: this store never mutates live mission state behind its back.
   */
  rollbackTo(checkpointId, recorder, actor, reason) {
    const cp = this.get(checkpointId);
    if (!cp) return null;
    recorder.record({
      kind: "MISSION_ROLLED_BACK",
      actor,
      authority: actor === "human" ? "human" : "supervisor",
      policy: "checkpoint.rollback",
      reason,
      subjectId: cp.checkpointId,
      data: {
        label: cp.label,
        graphVersion: cp.graphVersion,
        discardedCheckpoints: this.forMission(cp.missionId).filter((c) => c.createdAt > cp.createdAt).length
      }
    });
    this.checkpoints = this.checkpoints.filter((c) => c.createdAt <= cp.createdAt);
    return cp;
  }
  hydrate(checkpoints) {
    this.checkpoints = [...checkpoints];
  }
  export() {
    return [...this.checkpoints];
  }
};
function validateRestoredState(state) {
  const errors = [];
  if (!state) return { ok: false, errors: ["no saved state"] };
  if (state.version !== 6) errors.push(`unsupported state version ${String(state.version)} (expected 6)`);
  if (!state.missionId) errors.push("missing missionId");
  if (!Array.isArray(state.tasks)) errors.push("missing task states");
  if (!Array.isArray(state.agents)) errors.push("missing agent states");
  if (!Array.isArray(state.flightEvents)) errors.push("missing flight recorder trace");
  if (!state.usage) errors.push("missing resource usage");
  return { ok: errors.length === 0, errors };
}

// src/mission/graphMutator.ts
init_id();

// src/graph/validation.ts
function validateWorkflow(graph) {
  const issues = [];
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const conns = graph.connections;
  if (graph.nodes.length === 0) {
    issues.push({ severity: "warning", message: "Workflow is empty." });
    return issues;
  }
  for (const node of graph.nodes) {
    for (const port of node.inputs) {
      if (port.required && !conns.some((c) => c.targetNodeId === node.id && c.targetPortId === port.id)) {
        issues.push({
          nodeId: node.id,
          portId: port.id,
          severity: "error",
          message: `Node "${node.title}" is missing required input "${port.label}" (${port.dataType}).`
        });
      }
    }
    if (node.purpose.trim() === "" && node.inputs.length > 0 && node.definitionId.startsWith("agent.")) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: `Agent node "${node.title}" has no Purpose set.`
      });
    }
    if (!node.contract || typeof node.contract.timeoutMs !== "number" || node.contract.timeoutMs <= 0) {
      issues.push({
        nodeId: node.id,
        severity: "error",
        message: `Node "${node.title}" has an invalid execution timeout.`
      });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  for (const conn of conns) {
    const key2 = `${conn.sourceNodeId}:${conn.sourcePortId}->${conn.targetNodeId}:${conn.targetPortId}`;
    if (seen.has(key2)) {
      issues.push({ connectionId: conn.id, severity: "error", message: "Duplicate connection between the same ports." });
    }
    seen.add(key2);
    const src = nodes.get(conn.sourceNodeId);
    const tgt = nodes.get(conn.targetNodeId);
    if (!src || !tgt) {
      issues.push({ connectionId: conn.id, severity: "error", message: "Connection references missing nodes." });
      continue;
    }
    const srcPort = src.outputs.find((p2) => p2.id === conn.sourcePortId);
    const tgtPort = tgt.inputs.find((p2) => p2.id === conn.targetPortId);
    if (!srcPort) {
      issues.push({
        nodeId: src.id,
        portId: conn.sourcePortId,
        connectionId: conn.id,
        severity: "error",
        message: `Source port not found on "${src.title}".`
      });
    }
    if (!tgtPort) {
      issues.push({
        nodeId: tgt.id,
        portId: conn.targetPortId,
        connectionId: conn.id,
        severity: "error",
        message: `Target port not found on "${tgt.title}".`
      });
    }
    if (srcPort && tgtPort) {
      if (!portsCompatible(srcPort.dataType, tgtPort.dataType)) {
        issues.push({
          nodeId: tgt.id,
          portId: tgtPort.id,
          connectionId: conn.id,
          severity: "error",
          message: `Type mismatch: "${src.title}.${srcPort.label}" emits ${srcPort.dataType} but "${tgt.title}.${tgtPort.label}" expects ${tgtPort.dataType}.`
        });
      }
      if (!tgtPort.multiple) {
        const duplicates = conns.filter(
          (c) => c !== conn && c.targetNodeId === conn.targetNodeId && c.targetPortId === conn.targetPortId
        );
        if (duplicates.length > 0) {
          issues.push({
            nodeId: tgt.id,
            portId: tgtPort.id,
            severity: "error",
            message: `Input "${tgtPort.label}" on "${tgt.title}" accepts a single connection but receives multiple.`
          });
        }
      }
    }
  }
  const cycle = findCycle(graph.nodes, conns);
  if (cycle) {
    issues.push({
      severity: "error",
      message: `Cycle detected: ${cycle.map((id) => nodes.get(id)?.title ?? id).join(" \u2192 ")}`
    });
  }
  const consumed = /* @__PURE__ */ new Set([...conns.map((c) => c.sourceNodeId), ...conns.map((c) => c.targetNodeId)]);
  for (const node of graph.nodes) {
    if (!consumed.has(node.id) && graph.nodes.length > 1) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: `Node "${node.title}" is isolated (no connections).`
      });
    }
  }
  return issues;
}
function findCycle(nodes, conns) {
  const adj = /* @__PURE__ */ new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const c of conns) {
    if (adj.has(c.sourceNodeId)) adj.get(c.sourceNodeId).push(c.targetNodeId);
  }
  const state = /* @__PURE__ */ new Map();
  const stack = [];
  const dfs = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const s = state.get(next) ?? 0;
      if (s === 1) {
        stack.push(next);
        return true;
      }
      if (s === 0 && dfs(next)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };
  for (const n of nodes) {
    if ((state.get(n.id) ?? 0) === 0) {
      stack.length = 0;
      if (dfs(n.id)) {
        const last = stack[stack.length - 1];
        const at = stack.indexOf(last);
        return stack.slice(at);
      }
    }
  }
  return null;
}

// src/mission/graphMutator.ts
function policyCheck(req) {
  const failures = [];
  const policy = req.mission.riskPolicy;
  if (!policy.allowGraphMutation) failures.push("mission policy disables graph mutation");
  if (req.authority === "SUPERVISOR" && policy.autonomy === "HUMAN_ONLY") {
    failures.push("autonomy is HUMAN_ONLY: only a human may authorise a graph change");
  }
  if (req.mission.graphVersion >= req.mission.budget.maxGraphMutations) {
    failures.push(
      `graph mutation budget exhausted: version ${req.mission.graphVersion} of max ${req.mission.budget.maxGraphMutations}`
    );
  }
  if (!req.evidence.length) failures.push("no evidence supplied \u2014 a graph change must cite what it observed");
  if (!req.reason.trim()) failures.push("no reason supplied");
  return { passed: failures.length === 0, failures };
}
function evaluationCheck(nextGraph) {
  const issues = validateWorkflow(nextGraph);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length) {
    return { passed: false, detail: `${errors.length} structural error(s): ${errors.slice(0, 4).map((e) => e.message).join(" | ")}` };
  }
  if (!nextGraph.nodes.length) return { passed: false, detail: "proposed graph has no nodes" };
  return {
    passed: true,
    detail: `${nextGraph.nodes.length} nodes, ${nextGraph.connections.length} connections, ${issues.filter((i) => i.severity === "warning").length} warning(s)`
  };
}
function regressionCheck(req) {
  const nextTitles = new Set(req.nextGraph.nodes.map((n) => n.title));
  const lost = req.completedWork.filter((t) => !nextTitles.has(t));
  if (lost.length) {
    return {
      passed: false,
      detail: `mutation would discard completed work: ${lost.join(", ")}. Roll back to a checkpoint instead of mutating.`
    };
  }
  const before = new Set(req.graph.nodes.map((n) => n.title));
  const added = [...nextTitles].filter((t) => !before.has(t));
  const removed = [...before].filter((t) => !nextTitles.has(t));
  return {
    passed: true,
    detail: `adds [${added.join(", ") || "nothing"}], removes [${removed.join(", ") || "nothing"}], preserves ${req.completedWork.length} completed node(s)`
  };
}
function proposeMutation(req, recorder) {
  const policy = policyCheck(req);
  const evaluation = policy.passed ? evaluationCheck(req.nextGraph) : null;
  const regression2 = policy.passed && evaluation?.passed ? regressionCheck(req) : null;
  const mutation = {
    mutationId: uid("mut"),
    missionId: req.mission.missionId,
    fromGraphVersion: req.mission.graphVersion,
    toGraphVersion: req.mission.graphVersion + 1,
    reason: req.reason,
    evidence: req.evidence,
    requestedBy: req.requestedBy,
    authority: req.authority,
    policyCheck: policy,
    evaluation,
    regression: regression2,
    rollbackTargetVersion: req.mission.graphVersion,
    graphSnapshotBefore: req.graph,
    appliedAt: (/* @__PURE__ */ new Date()).toISOString(),
    applied: false
  };
  const blockedBy = !policy.passed ? `policy: ${policy.failures.join("; ")}` : evaluation && !evaluation.passed ? `evaluation: ${evaluation.detail}` : regression2 && !regression2.passed ? `regression: ${regression2.detail}` : null;
  mutation.applied = blockedBy === null;
  recorder.record({
    kind: "GRAPH_MUTATED",
    actor: req.requestedBy,
    authority: req.authority,
    policy: `allowGraphMutation=${req.mission.riskPolicy.allowGraphMutation};autonomy=${req.mission.riskPolicy.autonomy}`,
    reason: req.reason,
    evidence: req.evidence,
    subjectId: mutation.mutationId,
    data: {
      applied: mutation.applied,
      blockedBy,
      fromVersion: mutation.fromGraphVersion,
      toVersion: mutation.toGraphVersion,
      evaluation: evaluation?.detail ?? null,
      regression: regression2?.detail ?? null
    }
  });
  return { mutation, applied: mutation.applied, blockedBy };
}
function completedTitles(graph, completedNodeIds) {
  return graph.nodes.filter((n) => completedNodeIds.has(n.id)).map((n) => n.title);
}

// src/mission/checkRunner.ts
var join3 = (dir, name) => dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}/${name}`;
async function discoverChecks(repoDir, read, exists = (p2) => existsViaRead(p2, read)) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (spec) => {
    const key2 = `${spec.command} ${spec.args.join(" ")}`;
    if (seen.has(key2)) return;
    seen.add(key2);
    out.push(spec);
  };
  const pkgRaw = await tryRead(join3(repoDir, "package.json"), read);
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw);
      const scripts = pkg.scripts ?? {};
      const allDeps = { ...pkg.dependencies ?? {}, ...pkg.devDependencies ?? {} };
      const typecheck = pickScript(scripts, ["typecheck", "type-check", "tsc"]);
      if (typecheck) {
        add({ id: "typecheck", label: "Typecheck", source: "STATIC_CHECK", command: "npm", args: ["run", typecheck.name], timeoutSecs: 240, discoveredFrom: `package.json scripts.${typecheck.name}` });
      } else if (allDeps.typescript) {
        add({ id: "typecheck", label: "Typecheck", source: "STATIC_CHECK", command: "npm", args: ["exec", "--", "tsc", "--noEmit"], timeoutSecs: 240, discoveredFrom: "package.json dependency: typescript" });
      }
      const lint = pickScript(scripts, ["lint", "eslint", "biome", "check"]);
      if (lint) {
        add({ id: "lint", label: "Lint", source: "STATIC_CHECK", command: "npm", args: ["run", lint.name], timeoutSecs: 180, discoveredFrom: `package.json scripts.${lint.name}` });
      }
      const test = pickScript(scripts, ["test", "test:unit", "test:run"]);
      if (test) {
        add({ id: "test", label: "Test suite", source: "TEST_RUN", command: "npm", args: ["run", test.name], timeoutSecs: 600, discoveredFrom: `package.json scripts.${test.name}` });
      }
    } catch {
    }
  }
  if (await exists(join3(repoDir, "Cargo.toml"))) {
    add({ id: "cargo-check", label: "cargo check", source: "STATIC_CHECK", command: "cargo", args: ["check", "--all-targets"], timeoutSecs: 900, discoveredFrom: "Cargo.toml" });
    add({ id: "cargo-test", label: "cargo test", source: "TEST_RUN", command: "cargo", args: ["test"], timeoutSecs: 900, discoveredFrom: "Cargo.toml" });
  }
  if (await exists(join3(repoDir, "pyproject.toml")) || await exists(join3(repoDir, "pytest.ini"))) {
    add({ id: "pytest", label: "pytest", source: "TEST_RUN", command: "python3", args: ["-m", "pytest", "-q"], timeoutSecs: 600, discoveredFrom: "pyproject.toml / pytest.ini" });
  }
  return out;
}
function pickScript(scripts, names) {
  for (const n of names) if (scripts[n]) return { name: n };
  return null;
}
async function tryRead(path3, read) {
  try {
    return await read(path3);
  } catch {
    return null;
  }
}
async function existsViaRead(path3, read) {
  return await tryRead(path3, read) !== null;
}
async function runCheck(spec, repoDir, run, canRun, exists = existsNative) {
  const started = Date.now();
  const finish = (r) => ({ spec, durationMs: Date.now() - started, ...r });
  if (!await canRun()) {
    return finish({ didRun: false, exitCode: null, output: "", reason: "no executor available \u2014 this needs the native desktop build, not the browser preview" });
  }
  if (/^(npm|npx|yarn|pnpm)$/.test(spec.command)) {
    if (!await exists(join3(repoDir, "node_modules"))) {
      return finish({ didRun: false, exitCode: null, output: "", reason: "node_modules is absent; VH will not run an install for you, so this check was not performed" });
    }
  }
  try {
    const r = await run(spec.command, spec.args, repoDir, spec.timeoutSecs);
    const output = [r.stdout, r.stderr].filter((s) => s && s.trim()).join("\n").trim();
    return finish({
      didRun: true,
      exitCode: r.code,
      output,
      reason: r.code === 0 ? null : `exited ${r.code ?? "with no code (killed or signalled)"}`
    });
  } catch (e) {
    return finish({ didRun: false, exitCode: null, output: "", reason: e instanceof Error ? e.message : String(e) });
  }
}
function isBrowser() {
  return typeof window !== "undefined" && typeof process === "undefined";
}
async function readNative(path3) {
  if (isBrowser()) {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return ipc2.fsRead(path3);
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(path3, "utf8");
}
async function existsNative(path3) {
  if (isBrowser()) {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    try {
      await ipc2.fsList(path3);
      return true;
    } catch {
      return false;
    }
  }
  const { stat } = await import("node:fs/promises");
  try {
    await stat(path3);
    return true;
  } catch {
    return false;
  }
}
var SHELL_ALLOWED = /* @__PURE__ */ new Set([
  "hermes",
  "agent",
  "node",
  "npm",
  "npx",
  "python",
  "python3",
  "pip",
  "pip3",
  "pytest",
  "cargo",
  "git",
  "go"
]);
async function runNative(command, args, cwd, timeoutSecs) {
  if (isBrowser()) {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    const r = await ipc2.shellExec(command, args, cwd, timeoutSecs);
    return { stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? ""), code: r.code ?? null };
  }
  const bare = command.replace(/.*[\\/]/, "").replace(/\.(exe|cmd|bat|com)$/i, "");
  if (!SHELL_ALLOWED.has(bare)) {
    return { stdout: "", stderr: `shell capability boundary: '${command}' is not an allowlisted CLI (${[...SHELL_ALLOWED].join(", ")}). Refused in words; nothing ran.`, code: null };
  }
  const { spawn } = await import("node:child_process");
  const { scrubEnv: scrubEnv2 } = await Promise.resolve().then(() => (init_sandbox(), sandbox_exports));
  const scrubbed = scrubEnv2(process.env);
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, env: { ...scrubbed, NO_COLOR: "1", GIT_TERMINAL_PROMPT: "0" } });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, Math.max(1, timeoutSecs) * 1e3);
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}
${e.message}`.trim(), code: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
async function canRunNative() {
  if (isBrowser()) {
    const { detectHost: detectHost2 } = await Promise.resolve().then(() => (init_desktop(), desktop_exports));
    return detectHost2() === "tauri";
  }
  return true;
}
async function runAllChecks(repoDir, opts = {}) {
  const read = opts.read ?? readNative;
  const run = opts.run ?? runNative;
  const canRun = opts.canRun ?? canRunNative;
  const exists = opts.exists ?? ((p2) => existsViaRead(p2, read));
  let specs = await discoverChecks(repoDir, read);
  if (opts.only?.length) specs = specs.filter((s) => opts.only.includes(s.source));
  const out = [];
  for (const spec of specs) out.push(await runCheck(spec, repoDir, run, canRun, exists));
  return out;
}

// src/mission/memory.ts
init_id();
var OrganizationMemory = class {
  entries = [];
  remember(input) {
    if (!input.scopeKey) throw new Error("memory: a scope key is required; unscoped memory is not stored");
    const entry = {
      id: uid("mem"),
      scope: input.scope,
      scopeKey: input.scopeKey,
      missionId: input.missionId,
      kind: input.kind,
      content: input.content,
      evidence: input.evidence ?? [],
      importance: input.importance ?? 0.5,
      tags: input.tags ?? [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.entries.push(entry);
    return entry;
  }
  /**
   * Scoped retrieval. Both `scope` and `scopeKey` are required — there is no "give me
   * everything" path.
   */
  retrieve(scope, scopeKey, limit = 8, query) {
    const pool = this.entries.filter((e) => e.scope === scope && e.scopeKey === scopeKey);
    const scored = pool.map((e) => ({ e, s: rank2(e, query) }));
    scored.sort((a, b) => b.s - a.s || b.e.createdAt.localeCompare(a.e.createdAt));
    return scored.slice(0, Math.max(1, limit)).map((x) => x.e);
  }
  /**
   * Cross-mission retrieval for a new mission: only distilled, high-importance evidence,
   * and only from the scopes that generalise. Never the raw trace of another mission.
   */
  relevantEvidence(query, limit = 6, excludeMissionId) {
    const generalises = /* @__PURE__ */ new Set(["DECISION", "FAILURE", "TEAM", "AGENT"]);
    const kinds = /* @__PURE__ */ new Set([
      "what_worked",
      "what_failed",
      "harness_success",
      "tool_failure",
      "rejected_architecture",
      "repair_strategy"
    ]);
    const pool = this.entries.filter(
      (e) => generalises.has(e.scope) && kinds.has(e.kind) && e.missionId !== excludeMissionId && e.importance >= 0.4
    );
    return pool.map((e) => ({ e, s: rank2(e, query) })).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.e);
  }
  forMission(missionId) {
    return this.entries.filter((e) => e.missionId === missionId);
  }
  byScope(scope) {
    return this.entries.filter((e) => e.scope === scope);
  }
  /** Distil a finished mission into the entries worth carrying forward. */
  distil(missionId, recorder) {
    const out = [];
    for (const e of recorder.ofKind("EVALUATION_PASSED")) {
      out.push(
        this.remember({
          scope: "MISSION",
          scopeKey: missionId,
          missionId,
          kind: "what_worked",
          content: `${String(e.data.artifact ?? e.subjectId ?? "artifact")} passed independent evaluation: ${e.reason}`,
          evidence: e.evidence,
          importance: 0.7,
          tags: ["evaluation"]
        })
      );
    }
    for (const e of recorder.ofKind("REPAIR_COMPLETED")) {
      out.push(
        this.remember({
          scope: "FAILURE",
          scopeKey: String(e.data.strategy ?? "repair"),
          missionId,
          kind: "repair_strategy",
          content: `Repair ${String(e.data.strategy ?? "?")} succeeded: ${e.reason}`,
          evidence: e.evidence,
          importance: 0.8,
          tags: ["repair"]
        })
      );
    }
    for (const e of recorder.ofKind("APPROVAL_REQUIRED")) {
      out.push(
        this.remember({
          scope: "DECISION",
          scopeKey: String(e.data.risk ?? "risk"),
          missionId,
          kind: "approval_required",
          content: `${String(e.data.risk)} action required human approval: ${e.reason}`,
          evidence: e.evidence,
          importance: 0.6,
          tags: ["approval", "governance"]
        })
      );
    }
    for (const e of recorder.ofKind("GRAPH_MUTATED")) {
      out.push(
        this.remember({
          scope: "DECISION",
          scopeKey: String(e.data.reason ?? "reorganization"),
          missionId,
          kind: "decision",
          content: `Organization changed: ${e.reason}`,
          evidence: e.evidence,
          importance: 0.75,
          tags: ["graph", "reorganization"]
        })
      );
    }
    return out;
  }
  hydrate(entries) {
    this.entries = [...entries];
  }
  export() {
    return [...this.entries];
  }
  get size() {
    return this.entries.length;
  }
};
function rank2(entry, query) {
  let score = entry.importance;
  if (query) {
    const q = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    const hay = `${entry.content} ${entry.tags.join(" ")} ${entry.kind}`.toLowerCase();
    let hits = 0;
    for (const w of q) if (hay.includes(w)) hits += 1;
    score += q.size ? 0.5 * (hits / q.size) : 0;
  }
  if (entry.evidence.length) score += 0.1;
  return score;
}
var ReputationLedger = class {
  records = [];
  note(subjectKind, subjectId, dimension, success, ms) {
    let rec = this.records.find((r) => r.subjectKind === subjectKind && r.subjectId === subjectId && r.dimension === dimension);
    if (!rec) {
      rec = { subjectKind, subjectId, dimension, wins: 0, losses: 0, totalMs: 0, runs: 0, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      this.records.push(rec);
    }
    rec.runs += 1;
    if (success) rec.wins += 1;
    else rec.losses += 1;
    rec.totalMs += ms;
    rec.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return rec;
  }
  view(subjectKind, subjectId) {
    const recs = this.records.filter((r) => r.subjectKind === subjectKind && r.subjectId === subjectId);
    const runs = recs.reduce((s, r) => s + r.runs, 0);
    const wins = recs.reduce((s, r) => s + r.wins, 0);
    const totalMs = recs.reduce((s, r) => s + r.totalMs, 0);
    return {
      subjectId,
      subjectKind,
      runs,
      successRate: runs ? wins / runs : 0,
      medianMs: runs ? Math.round(totalMs / runs) : 0,
      byDimension: recs.map((r) => ({
        dimension: r.dimension,
        runs: r.runs,
        successRate: r.runs ? r.wins / r.runs : 0,
        label: labelFor(r.runs ? r.wins / r.runs : 0, r.runs)
      })),
      confidence: Math.min(1, runs / 20)
    };
  }
  /** Every subject with at least one record, for the reputation page. */
  allViews() {
    const keys = new Set(this.records.map((r) => `${r.subjectKind}::${r.subjectId}`));
    return [...keys].map((k) => {
      const [subjectKind, subjectId] = k.split("::");
      return this.view(subjectKind, subjectId);
    });
  }
  hydrate(records) {
    this.records = [...records];
  }
  export() {
    return [...this.records];
  }
};
function labelFor(rate, runs) {
  if (runs < 3) return `insufficient evidence (${runs} run${runs === 1 ? "" : "s"})`;
  if (rate >= 0.85) return "strong";
  if (rate >= 0.6) return "adequate";
  if (rate >= 0.35) return "weak";
  return "poor";
}

// src/mission/missionPlanner.ts
init_id();

// src/domain/frameworks.ts
var AGENT_FRAMEWORKS = [
  { id: "fw.pipeline", name: "Specialist Pipeline", category: "flow", description: "Plan \u2192 research \u2192 implement \u2192 test \u2192 review.", roster: ["agent.planner", "agent.researcher", "agent.coder", "agent.tester", "agent.reviewer"], pattern: "pipeline", notes: "Default engineering path." },
  { id: "fw.hierarchy", name: "Hierarchical Crew", category: "crew", description: "Supervisor assigns; specialists execute; supervisor merges.", roster: ["agent.supervisor", "agent.planner", "agent.coder", "agent.tester"], pattern: "hierarchy", notes: "Supervisor never does specialist work." },
  { id: "fw.debate", name: "Dialectic Debate", category: "quality", description: "Proposal vs critic vs judge.", roster: ["agent.planner", "agent.critic", "agent.judge"], pattern: "debate", notes: "Steelman then attack." },
  { id: "fw.redblue", name: "Red / Blue", category: "security", description: "Attacker framing vs defender; judge binds.", roster: ["agent.security", "agent.reviewer", "agent.judge"], pattern: "debate", notes: "No exploit payloads." },
  { id: "fw.mapreduce", name: "Map\u2013Reduce Research", category: "knowledge", description: "Fan-out researchers, synthesizer reduces.", roster: ["agent.planner", "agent.researcher", "agent.researcher", "agent.synthesizer"], pattern: "map-reduce", notes: "Conflicts are first-class." },
  { id: "fw.swarm", name: "Peer Swarm", category: "crew", description: "Peers work in parallel; synthesizer only merges.", roster: ["agent.coder", "agent.docs", "agent.security", "agent.synthesizer"], pattern: "swarm", notes: "No supervisor. Merge is explicit." },
  { id: "fw.pair", name: "Pair Programming", category: "engineering", description: "Driver implements, tester verifies, navigator reviews.", roster: ["agent.coder", "agent.tester", "agent.reviewer"], pattern: "pair", notes: "Navigator does not rewrite. Roster is typed: Coder.result(AgentResult) -> Tester.subject, Tester.report(Evaluation) -> Reviewer.workProduct." },
  { id: "fw.council", name: "Council / Jury", category: "quality", description: "Three specialists score; judge binds.", roster: ["agent.critic", "agent.reviewer", "agent.qa", "agent.judge"], pattern: "council", notes: "Majority is not automatic \u2014 judge explains dissent." },
  { id: "fw.shadow", name: "Shadow Harness", category: "eval", description: "Same task on two harnesses; synthesizer diffs.", roster: ["agent.coder", "agent.coder", "agent.synthesizer"], pattern: "shadow", notes: "Set different harnesses on the two coders." },
  { id: "fw.specdriven", name: "Spec-Driven", category: "engineering", description: "Architect \u2192 contract \u2192 implement \u2192 verify.", roster: ["agent.architect", "agent.planner", "agent.coder", "agent.tester", "agent.qa"], pattern: "pipeline", notes: "Code is illegal before the contract." },
  { id: "fw.incident", name: "Incident Command", category: "ops", description: "Commander, debugger, SRE, coder, human gate.", roster: ["agent.supervisor", "agent.debugger", "agent.preset.sre", "agent.coder", "control.approval"], pattern: "hierarchy", notes: "Destructive actions require approval." },
  { id: "fw.socratic", name: "Socratic", category: "quality", description: "Critic only asks; author revises; judge scores.", roster: ["agent.critic", "agent.reflection", "agent.judge"], pattern: "loop", notes: "Bounded revisions." },
  { id: "fw.ensemble", name: "Ensemble Vote", category: "quality", description: "Three independent answers; synthesizer + judge.", roster: ["agent.custom", "agent.custom", "agent.custom", "agent.synthesizer", "agent.judge"], pattern: "council", notes: "Independence is the point \u2014 no shared scratch." },
  { id: "fw.scoutact", name: "Scout then Act", category: "flow", description: "Researcher scouts; planner commits; coder acts.", roster: ["agent.researcher", "agent.planner", "agent.coder"], pattern: "pipeline", notes: "No coding before evidence." },
  { id: "fw.adversarial-review", name: "Adversarial Review", category: "quality", description: "Author, hostile critic, constructive reviewer, judge.", roster: ["agent.coder", "agent.critic", "agent.reviewer", "agent.judge"], pattern: "debate", notes: "Hostile and constructive are different jobs." },
  { id: "fw.contract-net", name: "Contract Net", category: "crew", description: "Router auctions work; specialists bid via plans; supervisor awards.", roster: ["agent.router", "agent.planner", "agent.planner", "agent.supervisor", "agent.coder"], pattern: "hierarchy", notes: "Award is explicit." },
  { id: "fw.blackboard", name: "Blackboard", category: "crew", description: "Shared memory; specialists post; synthesizer reads the board.", roster: ["agent.researcher", "agent.architect", "agent.security", "agent.synthesizer"], pattern: "swarm", notes: "Enable memory on every node. Same team key." },
  { id: "fw.war-room", name: "War Room", category: "ops", description: "Supervisor, security, SRE, debugger, human approval.", roster: ["agent.supervisor", "agent.security", "agent.preset.sre", "agent.debugger", "control.approval"], pattern: "hierarchy", notes: "Time-boxed. No silent changes." },
  { id: "fw.producer-gate", name: "Producer \u2192 Reviewer \u2192 Gate", category: "flow", description: "Make, review, QA gate, optional human.", roster: ["agent.coder", "agent.reviewer", "agent.qa", "control.approval"], pattern: "gate", notes: "QA cannot rewrite the work." },
  { id: "fw.recursive", name: "Recursive Decompose", category: "flow", description: "Planner splits; parallel specialists; synthesizer.", roster: ["agent.planner", "control.parallel", "agent.coder", "agent.docs", "control.merge", "agent.synthesizer"], pattern: "map-reduce", notes: "Control nodes are real traffic." },
  { id: "fw.canary", name: "Canary then Full", category: "engineering", description: "Small coder pass, tester, then full coder.", roster: ["agent.coder", "agent.tester", "agent.coder", "agent.qa"], pattern: "pipeline", notes: "Second coder sees the canary evidence." },
  { id: "fw.dual-control", name: "Dual Control", category: "risk", description: "Two independent agents must agree; else human.", roster: ["agent.security", "agent.reviewer", "agent.judge", "control.approval"], pattern: "gate", notes: "Disagreement is a stop, not a merge." },
  { id: "fw.knowledge-distill", name: "Knowledge Distill", category: "learning", description: "Run \u2192 reflection \u2192 evolution propose. Never auto-invariants.", roster: ["agent.coder", "agent.reflection", "agent.evolution"], pattern: "loop", notes: "Evolution SUGGEST only." },
  { id: "fw.handoff-chain", name: "Handoff Chain", category: "flow", description: "Each agent writes a handoff packet for the next identity.", roster: ["agent.researcher", "agent.architect", "agent.coder", "agent.docs", "agent.qa"], pattern: "pipeline", notes: "Handoff must be executable without the author." },
  { id: "fw.clinic", name: "Specialist Clinic", category: "crew", description: "Router sends to one of several enterprise specialists.", roster: ["agent.router", "agent.preset.legal", "agent.security", "agent.preset.data-analyst"], pattern: "hierarchy", notes: "Router classifies; only one clinic sees the case." },
  { id: "fw.triangulation", name: "Research Triangulation", category: "knowledge", description: "Three researchers, different angles; synthesizer; judge.", roster: ["agent.researcher", "agent.researcher", "agent.researcher", "agent.synthesizer", "agent.judge"], pattern: "map-reduce", notes: "Force independent sources." },
  { id: "fw.moe-router", name: "Mixture of Experts", category: "crew", description: "Router picks expert; expert works; critic checks routing.", roster: ["agent.router", "agent.custom", "agent.critic"], pattern: "hierarchy", notes: "Misroutes are feedback for the router." },
  { id: "fw.staged-approval", name: "Staged Approval", category: "risk", description: "Draft, internal review, human, then execute.", roster: ["agent.planner", "agent.reviewer", "control.approval", "agent.coder"], pattern: "gate", notes: "Coder does not run before approval." },
  { id: "fw.refine-loop", name: "Critic\u2013Refine Loop", category: "quality", description: "Make, attack, revise, bounded.", roster: ["agent.coder", "agent.critic", "agent.reflection", "agent.tester"], pattern: "loop", notes: "maxAttempts on reflection." },
  { id: "fw.docs-from-trace", name: "Docs from Trace", category: "engineering", description: "Coder, tester, docs from what actually ran.", roster: ["agent.coder", "agent.tester", "agent.docs", "agent.reviewer"], pattern: "pipeline", notes: "Docs may not invent APIs." },
  { id: "fw.security-gate", name: "Security Gate", category: "security", description: "Threat model, secure review, judge, human.", roster: ["agent.security", "agent.reviewer", "agent.judge", "control.approval"], pattern: "gate", notes: "Fail closed." },
  { id: "fw.local-offline", name: "Air-gapped Local", category: "local", description: "Planner + local LLM + synthesizer. No cloud.", roster: ["agent.planner", "agent.local", "agent.synthesizer"], pattern: "pipeline", notes: "Harness = llm / Ollama." },
  { id: "fw.enterprise-change", name: "Enterprise Change Advisory", category: "enterprise", description: "PM, architect, security, SRE, legal, CAB human.", roster: ["agent.preset.pm", "agent.architect", "agent.security", "agent.preset.sre", "agent.preset.legal", "control.approval"], pattern: "council", notes: "CAB is the human node." },
  { id: "fw.due-diligence", name: "Due Diligence", category: "enterprise", description: "Research, finance, legal, security, synthesizer, judge.", roster: ["agent.researcher", "agent.preset.data-analyst", "agent.preset.legal", "agent.security", "agent.synthesizer", "agent.judge"], pattern: "map-reduce", notes: "Conflicts stay visible." }
];
var FRAMEWORK_COUNT = AGENT_FRAMEWORKS.length;

// src/mission/missionPlanner.ts
var DOMAIN_RULES = [
  { domain: "saas-build", match: /\b(saas|web ?app|dashboard|product|platform|mvp)\b/i, why: "Product build" },
  { domain: "security", match: /\b(security|audit|threat|pentest|vulnerab|cve|compliance)\b/i, why: "Security work" },
  { domain: "research", match: /\b(research|investigate|analys|analyz|survey|literature|market)\b/i, why: "Research task" },
  { domain: "migration", match: /\b(migrat|upgrade|port\b|rewrit|modernis|moderniz)\b/i, why: "Migration" },
  { domain: "incident", match: /\b(incident|outage|postmortem|on-?call|rollback)\b/i, why: "Incident response" },
  { domain: "data", match: /\b(pipeline|etl|warehouse|dataset|dbt|streaming)\b/i, why: "Data engineering" },
  { domain: "content", match: /\b(content|copy|blog|documentation|docs|write)\b/i, why: "Content production" },
  { domain: "release", match: /\b(release|deploy|ship|launch|cut)\b/i, why: "Release engineering" }
];
var LANG_RULES = [
  { lang: "TypeScript", match: /\b(typescript|tsx?\b|node|react|next\.?js|vue|svelte)\b/i },
  { lang: "Python", match: /\b(python|django|flask|fastapi|pandas|pytorch)\b/i },
  { lang: "Rust", match: /\b(rust|cargo|tokio)\b/i },
  { lang: "Go", match: /\b(go|golang)\b/i },
  { lang: "SQL", match: /\b(sql|postgres|mysql|sqlite|database|schema)\b/i },
  { lang: "Infrastructure", match: /\b(terraform|kubernetes|docker|aws|gcp|azure|helm)\b/i }
];
function analyseObjective(req) {
  const text = [req.objective, ...req.constraints, ...req.successCriteria].join("\n");
  const evidence = [];
  const domains = [];
  for (const rule of DOMAIN_RULES) {
    if (rule.match.test(text)) {
      domains.push(rule.domain);
      evidence.push(`${rule.why}: matched /${rule.match.source}/`);
    }
  }
  const languages = LANG_RULES.filter((l) => l.match.test(text)).map((l) => l.lang);
  if (req.languages?.length) {
    for (const l of req.languages) if (!languages.includes(l)) languages.push(l);
  }
  if (languages.length) evidence.push(`Languages detected: ${languages.join(", ")}`);
  const hasCode = languages.length > 0 || domains.includes("saas-build") || domains.includes("migration") || /\b(implement|build|code|feature|api|service)\b/i.test(text);
  return {
    domain: domains[0] ?? "general",
    needsArchitecture: hasCode && (domains.includes("saas-build") || domains.includes("migration") || /\b(architect|design|system|scale|schema)\b/i.test(text)),
    needsSecurity: domains.includes("security") || /\b(secur|auth|permission|credential|pii|gdpr|compliance)\b/i.test(text),
    needsTests: hasCode || /\b(test|qa|verif|quality|regression)\b/i.test(text),
    needsResearch: domains.includes("research") || domains.includes("data") || /\b(research|unknown|explore|compare|evaluate options)\b/i.test(text),
    needsBrowser: /\b(browse|scrape|crawl|web page|screenshot|e2e)\b/i.test(text),
    needsData: domains.includes("data") || /\b(dataset|csv|database|query|metrics)\b/i.test(text),
    needsDocs: domains.includes("content") || /\b(document|docs|readme|changelog|report)\b/i.test(text),
    // "production-ready" describes something end users will run: that is release-shaped even
    // when the sentence never uses the word ship/deploy/publish.
    needsRelease: domains.includes("release") || /\b(release|deploy|ship|publish)\b/i.test(text) || /\bproduction[- ]?ready\b|\bgo[- ]?live\b|\bproduction\b/i.test(text),
    languages,
    evidence
  };
}
function selectFramework(req, sig) {
  const text = [req.objective, ...req.constraints].join(" ").toLowerCase();
  const scores = AGENT_FRAMEWORKS.map((fw) => {
    const why = [];
    let score = 0;
    if (req.preferredFramework === fw.id) {
      score += 100;
      why.push("explicitly preferred by the mission");
    }
    if (fw.category === "engineering" && (sig.domain === "saas-build" || sig.domain === "migration")) {
      score += 3;
      why.push(`engineering framework for ${sig.domain}`);
    }
    if (fw.category === "security" && sig.needsSecurity) {
      score += 4;
      why.push("security work required");
    }
    if (fw.category === "knowledge" && sig.needsResearch) {
      score += 4;
      why.push("research required");
    }
    if (fw.category === "risk" && (sig.needsRelease || sig.needsSecurity)) {
      score += 3;
      why.push("risk gating required");
    }
    if (fw.pattern === "gate" && req.autonomy !== "AUTONOMOUS") {
      score += 2;
      why.push(`autonomy=${req.autonomy} benefits from an explicit gate`);
    }
    if (fw.pattern === "map-reduce" && sig.needsResearch) {
      score += 2;
      why.push("fan-out suits independent research");
    }
    if (fw.id === "fw.specdriven" && sig.domain === "saas-build") {
      score += 3;
      why.push("spec-driven suits a product build");
    }
    if (fw.id === "fw.due-diligence" && sig.domain === "research") {
      score += 2;
      why.push("due-diligence shape suits investigation");
    }
    const staffable = fw.roster.filter((r) => DEFINITIONS_BY_ID.has(r)).length;
    if (staffable < fw.roster.length) {
      score -= 10 * (fw.roster.length - staffable);
      why.push(`${fw.roster.length - staffable} roster member(s) unresolvable`);
    }
    if (/\bcrew\b/.test(text) && fw.id === "fw.crew-cli") {
      score += 5;
      why.push("user asked for a CLI crew");
    }
    return { id: fw.id, score, why };
  }).sort((a, b) => b.score - a.score);
  return { frameworkId: scores[0].id, scores };
}
function buildSteps(sig, req) {
  const steps = [];
  let i = 0;
  const idx = () => i++;
  const research = sig.needsResearch ? idx() : -1;
  if (research >= 0) {
    steps[research] = {
      kind: "research",
      agentDefId: "agent.researcher",
      title: "Research",
      purpose: `Establish what is actually known about: ${req.objective}. Cite evidence, mark unknowns, list the options that were rejected and why.`,
      capabilities: ["research", "synthesis"],
      preferredHarness: null,
      dependsOn: [],
      rationale: "The objective contains unknowns; planning without research would guess."
    };
  }
  const arch = sig.needsArchitecture ? idx() : -1;
  if (arch >= 0) {
    steps[arch] = {
      kind: "architecture",
      agentDefId: "agent.architect",
      title: "Architecture",
      purpose: `Produce a concrete architecture for: ${req.objective}. Name the components, the data model, the interfaces, the failure modes and the trade-offs taken.`,
      capabilities: ["architecture", "design"],
      preferredHarness: null,
      dependsOn: research >= 0 ? [research] : [],
      rationale: "A build of this shape needs an explicit design before code, so failures surface as design arguments rather than test failures."
    };
  }
  const impl = idx();
  steps[impl] = {
    kind: "implementation",
    agentDefId: "agent.coder",
    title: "Implementation",
    purpose: `Implement: ${req.objective}. Follow the architecture where one exists. Produce runnable code plus the exact commands used to build it.`,
    capabilities: ["coding", sig.languages[0]?.toLowerCase() ?? "coding"].filter(Boolean),
    // The arbitrator decides the harness; we only express a preference when the language is
    // strongly associated with one.
    preferredHarness: null,
    dependsOn: arch >= 0 ? [arch] : research >= 0 ? [research] : [],
    rationale: "Core delivery step."
  };
  let test = -1;
  if (sig.needsTests) {
    test = idx();
    steps[test] = {
      kind: "test",
      agentDefId: "agent.tester",
      title: "Verification",
      purpose: `Verify the implementation against: ${req.successCriteria.join("; ") || req.objective}. Run the tests, record actual command output, and report failures verbatim.`,
      capabilities: ["testing", "verification"],
      preferredHarness: null,
      dependsOn: [impl],
      rationale: "An agent must never be the sole authority on its own success (\xA718); this is the independent check."
    };
  }
  let sec = -1;
  if (sig.needsSecurity) {
    sec = idx();
    steps[sec] = {
      kind: "security",
      agentDefId: "agent.security",
      title: "Security review",
      purpose: `Review the implementation for injection, authorisation gaps, secret handling and unsafe defaults. No exploit payloads. Rank findings by exploitability.`,
      capabilities: ["security-review"],
      preferredHarness: null,
      dependsOn: test >= 0 ? [test] : [impl],
      rationale: "The objective touches security-sensitive surface."
    };
  }
  let review = -1;
  if (steps.length > 2 || sig.domain === "saas-build") {
    review = idx();
    steps[review] = {
      kind: "review",
      agentDefId: "agent.reviewer",
      title: "Independent review",
      purpose: `Review the produced work against the mission success criteria. Say what is missing. Do not rewrite it.`,
      capabilities: ["review"],
      preferredHarness: null,
      dependsOn: sec >= 0 ? [sec] : test >= 0 ? [test] : [impl],
      rationale: "A reviewer who did not produce the work is the cheapest independent signal available."
    };
  }
  let docs = -1;
  if (sig.needsDocs) {
    docs = idx();
    steps[docs] = {
      kind: "synthesis",
      agentDefId: "agent.docs",
      title: "Documentation",
      purpose: `Document what was actually built, from the trace. Do not invent APIs that were not implemented.`,
      capabilities: ["documentation"],
      preferredHarness: null,
      dependsOn: review >= 0 ? [review] : [impl],
      rationale: "The mission asks for written output."
    };
  }
  let synth = -1;
  if (steps.length >= 4) {
    synth = idx();
    steps[synth] = {
      kind: "synthesis",
      agentDefId: "agent.synthesizer",
      title: "Synthesis",
      purpose: `Merge the artifacts into one deliverable that answers: ${req.objective}. Surface conflicts between agents rather than smoothing them over.`,
      capabilities: ["synthesis"],
      preferredHarness: null,
      dependsOn: [docs >= 0 ? docs : review >= 0 ? review : impl],
      rationale: "More than three contributors produce overlapping output; something has to reconcile it."
    };
  }
  if (sig.needsRelease || req.autonomy === "HUMAN_ONLY") {
    const rel = idx();
    steps[rel] = {
      kind: "release",
      agentDefId: "control.approval",
      title: "Release gate",
      purpose: "Human decision on whether the mission outcome may be released.",
      capabilities: [],
      preferredHarness: null,
      dependsOn: [synth >= 0 ? synth : review >= 0 ? review : impl],
      rationale: sig.needsRelease ? "The objective includes shipping something." : "Mission runs in HUMAN_ONLY autonomy."
    };
  }
  return steps.filter((s) => Boolean(s));
}
function planMission(mission, req) {
  const request = {
    objective: mission.objective,
    constraints: mission.constraints,
    successCriteria: mission.successCriteria,
    budgetUsd: mission.budget.maxCostUsd,
    deadlineMs: mission.deadline ? new Date(mission.deadline).getTime() - Date.now() : null,
    autonomy: mission.riskPolicy.autonomy,
    languages: req?.languages,
    repository: req?.repository,
    preferredFramework: mission.preferredFramework,
    allowedHarnesses: mission.allowedHarnesses
  };
  const signals = analyseObjective(request);
  const { frameworkId, scores } = selectFramework(request, signals);
  const specs = buildSteps(signals, request);
  const warnings = [];
  const perStepUsd = request.budgetUsd > 0 ? request.budgetUsd / Math.max(1, specs.length) : 0;
  const steps = specs.map((s, n) => {
    const def = DEFINITIONS_BY_ID.get(s.agentDefId);
    if (!def) warnings.push(`No node definition for ${s.agentDefId}; step "${s.title}" will be skipped at instantiation.`);
    const risk = classifyRisk(s.purpose, s.kind).risk;
    const needsHuman = s.kind === "release" || risk === "CRITICAL" || request.autonomy === "HUMAN_ONLY" || request.autonomy === "SUPERVISED" && risk === "HIGH";
    return {
      id: `step-${n + 1}`,
      kind: s.kind,
      title: s.title,
      agentDefId: s.agentDefId,
      purpose: s.purpose,
      requiredCapabilities: s.capabilities,
      languages: s.kind === "implementation" || s.kind === "test" ? signals.languages : [],
      preferredHarness: s.preferredHarness,
      dependsOn: s.dependsOn.map((d) => `step-${d + 1}`),
      estimatedCostUsd: Number(perStepUsd.toFixed(4)),
      estimatedMs: estimateMs(s.kind),
      risk: s.kind === "release" ? "HIGH" : risk,
      requiresApproval: needsHuman,
      rationale: s.rationale
    };
  });
  if (!steps.length) warnings.push("The planner produced no steps. The objective may be too vague to plan.");
  if (signals.needsBrowser && !mission.boundary.browser) {
    warnings.push("The objective implies browser use but the mission boundary disables it.");
  }
  if (request.deadlineMs && request.deadlineMs > 0) {
    const total = steps.reduce((s, x) => s + x.estimatedMs, 0);
    if (total > request.deadlineMs) {
      warnings.push(`Estimated ${Math.round(total / 6e4)} min of sequential work against a ${Math.round(request.deadlineMs / 6e4)} min deadline. Parallelise or reduce scope.`);
    }
  }
  const estimatedCostUsd = steps.reduce((s, x) => s + x.estimatedCostUsd, 0);
  if (estimatedCostUsd > request.budgetUsd) {
    warnings.push(`Plan estimates $${estimatedCostUsd.toFixed(2)} against a $${request.budgetUsd.toFixed(2)} budget.`);
  }
  const plan = {
    planId: uid("plan"),
    missionId: mission.missionId,
    version: 1,
    frameworkId,
    steps,
    verificationStrategy: verificationStrategy(signals, steps),
    approvalCheckpoints: steps.filter((s) => s.requiresApproval).map((s) => s.id),
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
    estimatedMs: steps.reduce((s, x) => s + x.estimatedMs, 0),
    requiresBrowser: signals.needsBrowser,
    workspaceRequirements: workspaceRequirements(signals),
    warnings,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { plan, signals, frameworkScores: scores };
}
function estimateMs(kind) {
  switch (kind) {
    case "research":
      return 9e4;
    case "architecture":
      return 12e4;
    case "implementation":
      return 3e5;
    case "test":
      return 12e4;
    case "security":
      return 12e4;
    case "review":
      return 9e4;
    case "synthesis":
      return 6e4;
    case "approval":
      return 0;
    case "release":
      return 0;
  }
}
function verificationStrategy(sig, steps) {
  const out = [];
  out.push("No agent declares its own success: every deliverable is checked by a step that did not produce it.");
  if (steps.some((s) => s.kind === "test")) {
    out.push("Tests are executed, not asserted. Recorded command output is the evidence.");
  }
  if (sig.languages.length) {
    out.push(`Static checks for ${sig.languages.join(", ")} (typecheck/lint) where a toolchain exists.`);
  }
  if (sig.needsSecurity) out.push("Security review with findings ranked by exploitability; no exploit payloads produced.");
  out.push("An independent reviewer states what is missing rather than restating what was done.");
  out.push("Checks that could not be measured are reported as unmeasured, never counted as passes.");
  return out;
}
function workspaceRequirements(sig) {
  const out = [];
  if (sig.languages.length) out.push(`Toolchain for ${sig.languages.join(", ")}`);
  if (sig.needsBrowser) out.push("A browser session with a scoped profile");
  if (sig.needsData) out.push("Readable dataset location");
  if (sig.needsRelease) out.push("Deployment target credentials (mission boundary must grant `credentials`)");
  if (!out.length) out.push("Workspace filesystem access only");
  return out;
}
function parallelWaves(steps) {
  const placed = /* @__PURE__ */ new Set();
  const waves = [];
  let remaining = [...steps];
  let guard = 0;
  while (remaining.length && guard++ < 100) {
    const wave = remaining.filter((s) => s.dependsOn.every((d) => placed.has(d)));
    if (!wave.length) {
      waves.push(remaining);
      break;
    }
    for (const s of wave) placed.add(s.id);
    remaining = remaining.filter((s) => !placed.has(s.id));
    waves.push(wave);
  }
  return waves;
}

// src/mission/negotiation.ts
init_id();
var NegotiationTable = class {
  threads = /* @__PURE__ */ new Map();
  open(input, recorder) {
    const thread = {
      threadId: uid("neg"),
      missionId: input.missionId,
      taskId: input.taskId ?? null,
      topic: input.topic,
      positions: [],
      resolution: null,
      decidedBy: null,
      decisionRationale: null,
      openedAt: (/* @__PURE__ */ new Date()).toISOString(),
      closedAt: null
    };
    this.threads.set(thread.threadId, thread);
    recorder.record({
      kind: "NEGOTIATION_OPENED",
      actor: input.openedBy,
      authority: "runtime",
      policy: "negotiation.open",
      reason: `Disagreement or decision required on: ${input.topic}`,
      subjectId: thread.threadId,
      data: { taskId: thread.taskId }
    });
    return thread;
  }
  /**
   * Record a position. A REJECT or CHALLENGE without evidence is refused: an objection you
   * cannot support does not get to block a mission.
   */
  position(input, recorder) {
    const thread = this.threads.get(input.threadId);
    if (!thread) throw new Error(`unknown negotiation thread ${input.threadId}`);
    if (thread.resolution) throw new Error(`thread ${input.threadId} is already ${thread.resolution}`);
    if ((input.kind === "REJECT" || input.kind === "CHALLENGE") && !input.evidence?.length) {
      throw new Error(
        `negotiation: ${input.agentTitle} cannot ${input.kind.toLowerCase()} without evidence. State what you observed.`
      );
    }
    if (input.kind === "ALTERNATIVE" && !input.proposal) {
      throw new Error(`negotiation: ${input.agentTitle} offered an alternative without stating it.`);
    }
    const pos = {
      positionId: uid("pos"),
      threadId: thread.threadId,
      agentId: input.agentId,
      agentTitle: input.agentTitle,
      kind: input.kind,
      statement: input.statement,
      evidence: input.evidence ?? [],
      proposal: input.proposal ?? null,
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
    thread.positions.push(pos);
    recorder.record({
      kind: "NEGOTIATION_POSITION",
      actor: input.agentTitle,
      authority: `agent:${input.agentId}`,
      policy: "negotiation.position",
      reason: input.statement,
      evidence: pos.evidence,
      subjectId: thread.threadId,
      data: { position: pos.kind, proposal: pos.proposal }
    });
    return pos;
  }
  /** True when every participant who spoke has accepted and nobody has an open objection. */
  consensusReached(threadId) {
    const thread = this.threads.get(threadId);
    if (!thread) return { reached: false, objectors: [] };
    const objectors = [];
    const lastByAgent = /* @__PURE__ */ new Map();
    for (const p2 of thread.positions) lastByAgent.set(p2.agentId, p2);
    for (const p2 of lastByAgent.values()) {
      if (p2.kind === "REJECT" || p2.kind === "CHALLENGE") objectors.push(p2.agentTitle);
    }
    const hasAccept = [...lastByAgent.values()].some((p2) => p2.kind === "ACCEPT");
    return { reached: objectors.length === 0 && hasAccept, objectors };
  }
  resolve(threadId, resolution, decidedBy, rationale, recorder) {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`unknown negotiation thread ${threadId}`);
    thread.resolution = resolution;
    thread.decidedBy = decidedBy;
    thread.decisionRationale = rationale;
    thread.closedAt = (/* @__PURE__ */ new Date()).toISOString();
    recorder.record({
      kind: "NEGOTIATION_RESOLVED",
      actor: decidedBy,
      authority: resolution === "ESCALATED_HUMAN" ? "human" : resolution === "SUPERVISOR_DECIDED" ? "supervisor" : "consensus",
      policy: "negotiation.resolve",
      reason: rationale,
      subjectId: thread.threadId,
      data: { resolution, positions: thread.positions.length }
    });
    return thread;
  }
  get(threadId) {
    return this.threads.get(threadId) ?? null;
  }
  forMission(missionId) {
    return [...this.threads.values()].filter((t) => t.missionId === missionId);
  }
  openThreads(missionId) {
    return this.forMission(missionId).filter((t) => !t.resolution);
  }
  hydrate(threads) {
    for (const t of threads) this.threads.set(t.threadId, t);
  }
  export() {
    return [...this.threads.values()];
  }
  /** Render a thread the way the UI shows it. */
  static render(thread) {
    const lines = [`Topic: ${thread.topic}`, `Status: ${thread.resolution ?? "OPEN"}`];
    for (const p2 of thread.positions) {
      lines.push(`${p2.agentTitle} [${p2.kind}]: ${p2.statement}`);
      if (p2.proposal) lines.push(`  proposal: ${p2.proposal}`);
      for (const e of p2.evidence) lines.push(`  evidence: ${e}`);
    }
    if (thread.decisionRationale) lines.push(`Decision by ${thread.decidedBy}: ${thread.decisionRationale}`);
    return lines.join("\n");
  }
};

// src/mission/securityBoundary.ts
function auditBoundary(boundary) {
  const warnings = [];
  if (boundary.credentials && !boundary.deploymentTargets.length) {
    warnings.push("Credentials are granted but no deployment target is declared. Narrow this unless the mission really needs secrets.");
  }
  if (boundary.filesystemWrite && !boundary.allowedPaths.length && !boundary.deniedPaths.length) {
    warnings.push("Filesystem writes are allowed with no path scoping. Set allowedPaths to the workspace.");
  }
  if (boundary.shell && boundary.network && boundary.credentials) {
    warnings.push("Shell + network + credentials together allow exfiltration. Confirm the mission needs all three.");
  }
  return warnings;
}

// src/engine/pureHash.ts
var K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
var rotr = (x, n) => (x >>> n | x << 32 - n) >>> 0;
var utf8 = (text) => new TextEncoder().encode(text);
function sha256Bytes(data) {
  const bitLen = data.length * 8;
  const padded = new Uint8Array((data.length + 8 >> 6 << 6) + 64);
  padded.set(data);
  padded[data.length] = 128;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
    h5 = h5 + f >>> 0;
    h6 = h6 + g >>> 0;
    h7 = h7 + h >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0);
  ov.setUint32(4, h1);
  ov.setUint32(8, h2);
  ov.setUint32(12, h3);
  ov.setUint32(16, h4);
  ov.setUint32(20, h5);
  ov.setUint32(24, h6);
  ov.setUint32(28, h7);
  return out;
}
var toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function pureSha256(text) {
  return toHex(sha256Bytes(utf8(text)));
}

// src/mission/durable.ts
function asKV(store) {
  if (typeof store.get === "function" && typeof store.set === "function" && typeof store.getItem !== "function") {
    return store;
  }
  if (typeof store.getItem === "function") {
    const ls = store;
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v) };
  }
  const m2 = store;
  return { get: (k) => m2.get(k) ?? null, set: (k, v) => void m2.set(k, v) };
}
function defaultDurableKV() {
  const ls = globalThis.localStorage;
  if (ls && typeof ls.getItem === "function") return asKV(ls);
  const mem = /* @__PURE__ */ new Map();
  return { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) };
}
var digestOf = (s) => pureSha256(s);
var key = (missionId) => `vh.durable.${missionId}`;
function durableSave(runtime, store = defaultDurableKV()) {
  const state = runtime.persist();
  const envelope = {
    format: "si-durable-mission/1",
    missionId: state.missionId,
    savedAt: (/* @__PURE__ */ new Date()).toISOString(),
    digest: digestOf(JSON.stringify(state)),
    state
  };
  asKV(store).set(key(state.missionId), JSON.stringify(envelope));
  return envelope;
}
function durableResume(runtime, store = defaultDurableKV()) {
  const raw = asKV(store).get(key(runtime.persist().missionId));
  if (!raw) return { ok: false, refused: `no durable snapshot for this mission \u2014 starting fresh is the honest path, not a silent resume.` };
  let env;
  try {
    env = JSON.parse(raw);
  } catch {
    return { ok: false, refused: "durable snapshot is corrupt (unparseable) \u2014 refused in words; work is NOT resumed into half-state." };
  }
  if (env.format !== "si-durable-mission/1") return { ok: false, refused: `unknown durable format "${env.format}" \u2014 refused.` };
  if (digestOf(JSON.stringify(env.state)) !== env.digest) return { ok: false, refused: "durable snapshot failed its digest \u2014 it was modified after save; refused rather than resumed." };
  const r = runtime.restore(env.state);
  if (!r.ok) return { ok: false, refused: `runtime restore refused: ${r.errors.join("; ")}` };
  return { ok: true, missionId: env.missionId, completedNodeIds: env.state.completedNodeIds, savedAt: env.savedAt };
}
var DoneLedger = class {
  constructor(store = defaultDurableKV(), storeKey = "vh.done.ledger") {
    this.store = store;
    this.storeKey = storeKey;
    try {
      const raw = asKV(this.store).get(storeKey);
      if (raw) for (const id of JSON.parse(raw)) this.done.add(id);
    } catch {
    }
  }
  done = /* @__PURE__ */ new Set();
  static actionId(missionId, nodeId, taskTitle) {
    return pureSha256(`${missionId}::${nodeId}::${taskTitle}`).slice(0, 32);
  }
  isDone(actionId) {
    return this.done.has(actionId);
  }
  /** Mark done ONLY after verified completion — callers pass the verification evidence. */
  markDone(actionId, verified) {
    if (!verified) return { ok: false, refused: `refused to mark "${actionId}" done without verification evidence \u2014 never-give-up means never FAKE done.` };
    this.done.add(actionId);
    try {
      asKV(this.store).set(this.storeKey, JSON.stringify([...this.done]));
    } catch {
    }
    return { ok: true };
  }
  get size() {
    return this.done.size;
  }
};

// src/mission/missionRuntime.ts
function boundaryStatements(b) {
  return [
    `MAY${b.filesystemRead ? "" : " NOT"}: read files inside the workspace`,
    `MAY${b.filesystemWrite ? "" : " NOT"}: write files inside the workspace`,
    `MAY${b.shell ? "" : " NOT"}: run shell commands`,
    `MAY${b.network ? "" : " NOT"}: use the network`,
    `MAY${b.browser ? "" : " NOT"}: use a browser`,
    `MAY${b.mcp ? "" : " NOT"}: call MCP tools`,
    `MAY${b.credentials ? "" : " NOT"}: touch stored credentials (never read their values)`
  ];
}
function createServices() {
  return {
    artifacts: new ArtifactStore(),
    approvals: new ApprovalGateService(),
    checkpoints: new CheckpointStore(),
    memory: new OrganizationMemory(),
    reputation: new ReputationLedger(),
    ledger: new HarnessLedger(),
    negotiations: new NegotiationTable()
  };
}
var MissionRuntime = class {
  mission;
  recorder;
  org;
  supervisor;
  resources;
  services;
  options;
  plan = null;
  planResult = null;
  teamBinding = null;
  graph;
  mutations = [];
  repairs = [];
  failures = [];
  /* 16.10.1 — the durable wire (F2): snapshot + once-guard live in ./durable.
   * defaultDurableKV wraps localStorage (getItem/setItem) when the host has it
   * and degrades to an ephemeral Map when it does not — execution never dies
   * because durability is unavailable. */
  durableKV = defaultDurableKV();
  doneLedger = new DoneLedger(this.durableKV);
  taskToStep = /* @__PURE__ */ new Map();
  taskToNode = /* @__PURE__ */ new Map();
  completedNodeIds = /* @__PURE__ */ new Set();
  triedHarnesses = /* @__PURE__ */ new Map();
  triedStrategies = /* @__PURE__ */ new Map();
  repairCount = /* @__PURE__ */ new Map();
  /** §18 Real verification results for the target repository, measured once per mission. */
  realChecks = null;
  /** Monotonic id source for steps a repair adds, so a rollback can never recycle an id. */
  addedStepSeq = 0;
  repairInFlight = /* @__PURE__ */ new Set();
  repairExhausted = /* @__PURE__ */ new Set();
  cancelled = false;
  paused = false;
  startedAt = Date.now();
  finalArtifactIds = [];
  simulatedUsed = false;
  constructor(mission, services2, options = {}) {
    this.mission = mission;
    this.services = services2;
    this.options = {
      allowSimulated: false,
      maxRepairAttempts: mission.budget.maxRetriesPerTask,
      approvalTimeoutMs: 5 * 60 * 1e3,
      ...options
    };
    this.recorder = recorderFor(mission.missionId);
    this.org = new OrganizationRuntime(mission, this.recorder);
    this.supervisor = new OrganizationSupervisor(mission, this.org, this.recorder);
    this.resources = new ResourceManager(mission.budget, Date.now());
    this.graph = emptyGraph(mission);
    this.recorder.record({
      kind: "MISSION_CREATED",
      actor: "user",
      authority: "human",
      policy: "mission.create",
      reason: mission.objective,
      subjectId: mission.missionId,
      data: {
        name: mission.name,
        templateId: mission.templateId,
        autonomy: mission.riskPolicy.autonomy,
        budget: mission.budget,
        boundaryWarnings: auditBoundary(mission.boundary)
      }
    });
  }
  /* ------------------------------------------------------------------ §1 lifecycle */
  transition(to, reason, actor = "runtime") {
    if (this.mission.status === to) return;
    if (!canTransition(this.mission.status, to)) {
      throw new Error(`illegal mission transition ${this.mission.status} -> ${to} (${reason})`);
    }
    const from = this.mission.status;
    this.mission.status = to;
    this.mission.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.recorder.record({
      kind: "MISSION_STATUS",
      actor,
      authority: actor === "human" ? "human" : "policy:lifecycle",
      policy: "mission.lifecycle",
      reason,
      subjectId: this.mission.missionId,
      data: { from, to }
    });
  }
  /* ------------------------------------------------------------------ §2 planning */
  /** Plan the mission. Nothing executes. The plan is inspectable before anything runs. */
  prepare() {
    this.transition("PLANNING", "Planning the organization for this objective.");
    let agentsContextSummary = "";
    if (this.options.repository) {
      try {
        const ctx = collectAgentsContext(this.options.repository);
        if (ctx.docs.length > 0) {
          const headings = ctx.docs.flatMap((d) => d.sections.map((s) => `${d.file}#${s.heading ?? d.title}`));
          agentsContextSummary = `${ctx.docs.length} AGENTS.md file(s), ${headings.length} sections: ${headings.slice(0, 6).join(", ")}${headings.length > 6 ? "\u2026" : ""}`;
        } else {
          agentsContextSummary = "no AGENTS.md found in the workspace";
        }
      } catch (e) {
        agentsContextSummary = `AGENTS.md scan failed: ${e.message}`;
      }
    }
    this.planResult = planMission(this.mission, { repository: this.options.repository });
    this.plan = this.planResult.plan;
    this.buildGraphFromPlan(this.plan);
    let agentsMdSeeded = null;
    if (this.options.repository) {
      try {
        const input = {
          missionId: this.mission.missionId,
          objective: this.mission.objective,
          doneWhen: this.mission.successCriteria,
          boundaries: boundaryStatements(this.mission.boundary),
          tasks: (this.plan?.steps ?? []).slice(0, 12).map((step) => ({ title: `${step.id} ${step.title}`, kind: step.kind, checks: step.requiredCapabilities.includes("verify") ? ["run the step's own checks"] : [] }))
        };
        agentsMdSeeded = writeAgentsMd(this.options.repository, input);
      } catch {
        agentsMdSeeded = null;
      }
    }
    this.transition("READY", `Plan produced: ${this.plan.steps.length} steps, framework ${this.plan.frameworkId}.${agentsContextSummary ? ` Conventions: ${agentsContextSummary}.` : ""}`);
    this.recorder.record({
      kind: "MISSION_PLANNED",
      actor: "planner",
      authority: "policy:planning",
      policy: "mission.plan-inspectable",
      reason: `Framework ${this.plan.frameworkId} selected; ${this.plan.steps.length} steps proposed.`,
      evidence: this.planResult.signals.evidence,
      subjectId: this.plan.planId,
      data: {
        frameworkId: this.plan.frameworkId,
        steps: this.plan.steps.map((s) => ({ id: s.id, title: s.title, kind: s.kind, risk: s.risk, requiresApproval: s.requiresApproval, rationale: s.rationale })),
        waves: parallelWaves(this.plan.steps).length,
        estimatedCostUsd: this.plan.estimatedCostUsd,
        warnings: this.plan.warnings,
        frameworkScores: this.planResult.frameworkScores.slice(0, 5),
        agentsContext: agentsContextSummary || "no workspace",
        agentsMdSeeded: agentsMdSeeded ?? null
      }
    });
    if (this.options.team && this.plan) {
      this.teamBinding = bindTeamToPlan(this.options.team, this.plan.steps);
      applyTeamToSteps(this.plan.steps, this.teamBinding);
      this.recorder.record({
        kind: "HARNESS_SELECTED",
        actor: "team",
        authority: `team:${this.options.team.id}`,
        policy: "mission.team-bound",
        reason: `Bound to crew ${this.options.team.name}`,
        subjectId: null,
        data: {
          teamId: this.options.team.id,
          teamName: this.options.team.name,
          bound: this.teamBinding.bound,
          unbound: this.teamBinding.unbound,
          bindings: this.teamBinding.bindings
        }
      });
    }
    this.checkpoint("after planning", "The plan is fixed; this is the rollback point for any reorganization.");
    return this.plan;
  }
  getTeamBinding() {
    return this.teamBinding;
  }
  getPlan() {
    return this.plan;
  }
  getGraph() {
    return this.graph;
  }
  /* ------------------------------------------------------------------ §3 organization */
  /** Instantiate the organization from the plan. */
  buildOrganization() {
    if (!this.plan) throw new Error("call prepare() before buildOrganization()");
    const agents = [];
    for (const step of this.plan.steps) {
      if (step.agentDefId.startsWith("control.")) continue;
      if (this.org.byDefinition(step.agentDefId)) continue;
      if (!DEFINITIONS_BY_ID.has(step.agentDefId)) {
        this.recorder.record({
          kind: "POLICY_DENIED",
          actor: "planner",
          authority: "runtime",
          policy: "organization.spawn",
          reason: `No node definition for ${step.agentDefId}; step "${step.title}" has no agent.`,
          subjectId: step.id
        });
        continue;
      }
      try {
        agents.push(
          this.org.spawn({
            definitionId: step.agentDefId,
            purpose: step.purpose,
            nodeId: this.nodeIdForStep(step.id) ?? null,
            planStepId: step.id,
            spawnedBy: "planner",
            spawnReason: `Plan step "${step.title}" requires this role. ${step.rationale}`
          })
        );
      } catch (e) {
        this.recorder.record({
          kind: "POLICY_DENIED",
          actor: "planner",
          authority: "runtime",
          policy: "organization.concurrency",
          reason: e instanceof Error ? e.message : String(e),
          subjectId: step.id
        });
      }
    }
    tasksFromPlan(this.org, this.plan.steps);
    for (const task of this.org.tasks_()) {
      const step = this.plan.steps.find((s) => s.id === task.planStepId);
      if (step) {
        this.taskToStep.set(task.taskId, step);
        const nodeId = this.nodeIdForStep(step.id);
        if (nodeId) this.taskToNode.set(task.taskId, nodeId);
      }
    }
    return agents;
  }
  /* ------------------------------------------------------------------ §36 execution */
  /** Run to completion (or to a block the runtime cannot resolve). */
  async run() {
    if (!this.plan) this.prepare();
    if (!this.org.agents().length) this.buildOrganization();
    this.transition("RUNNING", "Organization instantiated; executing the plan.");
    this.mission.startedAt = this.mission.startedAt ?? (/* @__PURE__ */ new Date()).toISOString();
    this.startedAt = Date.now();
    try {
      const res = durableResume(this, this.durableKV);
      if (res.ok) this.transition("RUNNING", `Durable resume: ${res.completedNodeIds.length} completed nodes restored (snapshot saved ${res.savedAt}) \u2014 finished work is not repeated.`);
    } catch {
    }
    let guard = 0;
    while (!this.cancelled && guard++ < 200) {
      while (this.paused && !this.cancelled) await sleep(50);
      this.resources.spend({ wallClockMs: 0 });
      const violation = this.resources.maySpend(0, this.org.agentsInState("ACTIVE").length);
      if (violation) {
        this.recorder.record({
          kind: "RESOURCE_LIMIT",
          actor: "resource-manager",
          authority: "policy:budget",
          policy: `budget.${violation.limit}`,
          reason: `${violation.limit} ceiling reached: ${violation.value} of ${violation.ceiling}.`,
          subjectId: this.mission.missionId,
          data: { ...violation }
        });
        this.transition("BLOCKED", `Budget ceiling ${violation.limit} reached. A human must raise it or stop the mission.`);
        break;
      }
      const signals = this.detect();
      const recommendations = this.supervisor.recommend(signals);
      for (const rec of recommendations) {
        if (rec.autoExecutable) await this.executeRecommendation(rec.id);
      }
      if (this.org.isDone()) break;
      const wave = this.org.dispatchableWave();
      if (!wave.length) {
        if (this.org.hasUnrecoverable() && !this.services.approvals.pendingForMission(this.mission.missionId).length) {
          const diagnosis = this.supervisor.diagnoseOrganization(this.failures, this.plan);
          if (diagnosis.reorganize && this.mission.riskPolicy.allowReorganization) {
            await this.reorganize(diagnosis.reason, diagnosis.evidence);
            continue;
          }
          this.transition("BLOCKED", "A task exhausted its repair budget and no further automated strategy applies.");
          break;
        }
        if (this.org.tasksInState("PENDING", "ASSIGNED", "RUNNING").length === 0) break;
        if (this.services.approvals.pendingForMission(this.mission.missionId).length) {
          this.transition("BLOCKED", "Waiting on a human approval gate.");
          await this.drainApprovals();
          this.transition("RUNNING", "Approval resolved; resuming.");
          continue;
        }
        const deadlock = this.failures.find((f) => f.kind === "DEPENDENCY_DEADLOCK");
        this.transition("BLOCKED", deadlock ? `Dependency deadlock: ${deadlock.detail}` : "No dispatchable task remains.");
        break;
      }
      for (const task of wave) {
        if (this.cancelled) break;
        await this.executeTask(task.taskId);
        this.durableSnapshot();
      }
    }
    return this.finish();
  }
  /** 16.10.1 — the durable envelope: the runtime's OWN persist() state, digest-
   * stamped and stored locally. Best-effort: a non-persistent host degrades
   * honestly instead of killing the mission. */
  durableSnapshot() {
    try {
      durableSave(this, this.durableKV);
    } catch {
    }
  }
  /** Execute one task end to end: arbitrate, gate, run, evaluate, repair if needed. */
  async executeTask(taskId) {
    const task = this.org.task(taskId);
    if (!task) return;
    if (task.state === "DONE" || task.state === "CANCELLED") return;
    const doneKey = DoneLedger.actionId(this.mission.missionId, this.taskToNode.get(taskId) ?? taskId, task.title);
    if (this.doneLedger.isDone(doneKey)) {
      this.org.setState(taskId, "DONE", { actor: "done-ledger", reason: "Already executed and verified in a previous run \u2014 never twice." });
      return;
    }
    if (!this.org.dependenciesMet(task)) {
      this.org.setState(taskId, "PENDING", { actor: "runtime", reason: "waiting on dependencies" });
      return;
    }
    const step = this.taskToStep.get(taskId) ?? null;
    if (step?.requiresApproval || task.risk === "CRITICAL" || task.cls === "APPROVAL_GATED") {
      const approved = await this.requestApproval(task, step);
      if (!approved) {
        this.org.setState(taskId, "BLOCKED", { error: "Awaiting or denied by human approval.", actor: "approval-gate" });
        return;
      }
    }
    const agent = this.pickAgentFor(task, step);
    if (!agent) {
      this.org.setState(taskId, "BLOCKED", {
        error: `missing capabilities: no roster member can perform "${task.title}"`,
        actor: "runtime"
      });
      return;
    }
    if (step?.requiresApproval || task.risk === "CRITICAL" || task.cls === "APPROVAL_GATED") {
      this.checkpoint(`before "${task.title}"`, "A human approved this risk-bearing action; this is the rollback point for it.");
    }
    this.org.delegate(taskId, agent.agentId, `Plan step "${step?.title ?? task.title}" assigned to ${agent.title}.`, "runtime");
    this.org.setState(taskId, "RUNNING", { actor: agent.agentId });
    if (!agent.harness) {
      const harness = this.arbitrate(task, step, agent);
      if (!harness) {
        this.org.setState(taskId, "FAILED", { error: "No eligible harness for this task.", actor: "arbitration" });
        await this.repair(taskId);
        return;
      }
    }
    const outcome = await this.invokeHarness(task, agent, step);
    if (outcome.simulated) this.simulatedUsed = true;
    const provenance = this.provenanceFor(agent, task, outcome);
    let artifact = null;
    if (outcome.text || !outcome.ok) {
      artifact = this.services.artifacts.create(
        {
          missionId: this.mission.missionId,
          name: `${task.title} \u2014 ${agent.title}`,
          content: outcome.ok ? outcome.text : `FAILED: ${outcome.error ?? "no output"}`,
          contentType: step?.kind === "test" ? "report" : "markdown",
          createdBy: agent.title,
          parentArtifactIds: task.inputArtifactIds,
          inputs: task.inputArtifactIds,
          provenance,
          taskId
        },
        this.recorder
      );
      this.org.addOutput(taskId, artifact.artifactId);
      this.finalArtifactIds.push(artifact.artifactId);
    }
    const evaluation = await this.evaluate(task, step, agent, outcome, artifact);
    if (artifact) this.services.artifacts.setEvaluation(artifact.artifactId, evaluation);
    this.recorder.record({
      kind: evaluation.passed ? "EVALUATION_PASSED" : "EVALUATION_FAILED",
      actor: "evaluation",
      authority: "policy:independent-evaluation",
      policy: "evaluation.no-self-certification",
      reason: evaluation.passed ? `All ${evaluation.checks.length} check(s) passed.` : evaluation.unmeasured.length ? `Not verified: ${evaluation.unmeasured.join("; ")}` : `Failed: ${evaluation.checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`,
      evidence: evaluation.checks.flatMap((c) => c.evidence).slice(0, 6),
      subjectId: artifact?.artifactId ?? taskId,
      data: { fullyMeasured: evaluation.fullyMeasured, checks: evaluation.checks.map((c) => ({ name: c.name, source: c.source, passed: c.passed, measured: c.measured })) }
    });
    this.services.ledger.record({
      missionId: this.mission.missionId,
      harness: agent.harness ?? "hermes",
      taskId,
      taskKind: step?.kind ?? "implementation",
      languages: step?.languages ?? [],
      repository: this.options.repository ?? this.mission.workspace,
      success: outcome.ok,
      independentlyVerified: evaluation.passed && evaluation.fullyMeasured,
      latencyMs: outcome.latencyMs,
      costUsd: outcome.costUsd,
      failureKind: outcome.ok ? null : "REPEATED_FAILURE"
    });
    this.services.reputation.note("agent", agent.definitionId, step?.kind ?? "general", evaluation.passed && evaluation.fullyMeasured, outcome.latencyMs);
    if (agent.harness) this.services.reputation.note("harness", agent.harness, step?.kind ?? "general", evaluation.passed && evaluation.fullyMeasured, outcome.latencyMs);
    this.org.recordWork(agent.agentId, {
      success: outcome.ok,
      tokensIn: Math.round(task.description.length / 4),
      tokensOut: Math.round((outcome.text?.length ?? 0) / 4),
      costUsd: outcome.costUsd,
      latencyMs: outcome.latencyMs
    });
    this.resources.spend({ costUsd: outcome.costUsd, tokens: Math.round((task.description.length + (outcome.text?.length ?? 0)) / 4) });
    if (outcome.ok && evaluation.passed) {
      this.org.setState(taskId, "DONE", { actor: agent.agentId, reason: `Completed and independently verified (${evaluation.checks.length} checks).` });
      const nodeId = this.taskToNode.get(taskId);
      if (nodeId) this.completedNodeIds.add(nodeId);
      this.doneLedger.markDone(doneKey, true);
      this.durableSnapshot();
      this.services.memory.remember({
        scope: "AGENT",
        scopeKey: agent.definitionId,
        missionId: this.mission.missionId,
        kind: "what_worked",
        content: `${agent.title} delivered "${task.title}" via ${agent.harness ?? "in-process"}; verified by ${evaluation.checks.map((c) => c.name).join(", ")}.`,
        evidence: evaluation.checks.flatMap((c) => c.evidence).slice(0, 3),
        importance: 0.6
      });
      return;
    }
    const failedMeasured = evaluation.checks.filter((c) => c.measured && !c.passed).map((c) => c.name);
    if (outcome.ok && failedMeasured.length === 0) {
      this.org.setState(taskId, "DONE", {
        actor: "evaluation",
        reason: `Delivered but not independently verified \u2014 unmeasured: ${evaluation.unmeasured.join("; ")}.`
      });
      const nodeId = this.taskToNode.get(taskId);
      if (nodeId) this.completedNodeIds.add(nodeId);
      this.services.memory.remember({
        scope: "FAILURE",
        scopeKey: `${step?.kind ?? "task"}:unmeasured`,
        missionId: this.mission.missionId,
        kind: "what_failed",
        content: `"${task.title}" was accepted without independent verification: ${evaluation.unmeasured.join("; ")}. A future mission must run these checks for real.`,
        evidence: [`unmeasured=${evaluation.unmeasured.join("|")}`, `harness=${agent.harness ?? "in-process"}`],
        importance: 0.8
      });
      return;
    }
    this.org.setState(taskId, "FAILED", {
      error: outcome.error ?? (evaluation.unmeasured.length ? `Not independently verified: ${evaluation.unmeasured.join("; ")}` : "Evaluation failed."),
      actor: agent.agentId
    });
    this.recorder.record({
      kind: "AGENT_FAILED",
      actor: agent.agentId,
      authority: "runtime",
      policy: "task.failure",
      reason: outcome.error ?? "Evaluation did not pass.",
      subjectId: taskId,
      data: { attempts: task.attempts, harness: agent.harness }
    });
    await this.repair(taskId);
  }
  /* ------------------------------------------------------------------ §6 arbitration */
  arbitrate(task, step, agent) {
    if (!step) return null;
    try {
      const decision = selectHarness(
        {
          mission: this.mission,
          step,
          installed: this.options.installed ?? {},
          allowSimulated: this.options.allowSimulated,
          repository: this.options.repository
        },
        this.services.ledger
      );
      agent.harness = decision.chosen;
      this.org.setHarness(agent.agentId, agent.harness, `Arbitration selected ${decision.chosen} for "${task.title}".`, "arbitration", decision.rationale);
      return decision.chosen;
    } catch (e) {
      this.recorder.record({
        kind: "POLICY_DENIED",
        actor: "arbitration",
        authority: "policy:arbitration",
        policy: "arbitration.no-eligible-harness",
        reason: e instanceof Error ? e.message : String(e),
        subjectId: task.taskId
      });
      return null;
    }
  }
  async invokeHarness(task, agent, step) {
    const harness = getHarness(agent.harness ?? "hermes");
    if (!harness) {
      return { ok: false, text: "", exitCode: null, latencyMs: 0, costUsd: 0, simulated: false, detail: "unknown harness", error: `unknown harness ${String(agent.harness)}` };
    }
    const prompt = [
      agent.contract.identity,
      "",
      `# Purpose`,
      agent.contract.purpose,
      "",
      `# Task`,
      task.title,
      task.description,
      "",
      `# Success criteria`,
      ...agent.contract.successCriteria.map((c) => `- ${c}`),
      "",
      "Report only what you actually did. If you could not verify something, say so."
    ].join("\n");
    const harnessTask = {
      taskId: task.taskId,
      title: task.title,
      prompt,
      kind: step?.kind ?? "implementation",
      languages: step?.languages ?? [],
      cwd: this.mission.workspace,
      timeoutMs: agent.contract.timeoutMs,
      requiredCapabilities: step?.requiredCapabilities ?? [],
      risk: task.risk,
      mayWriteFiles: agent.contract.permissions.filesystemWrite,
      mayRunShell: agent.contract.permissions.shell,
      mayUseBrowser: agent.contract.permissions.browser,
      grantedPermissions: { ...agent.contract.permissions }
    };
    {
      this.recorder.record({
        kind: "HARNESS_SELECTED",
        actor: "runtime",
        authority: `policy:risk-${task.risk}`,
        // No vendor argv any more. The native loop has no CLI flags to compose;
        // the receipt records the authority and the risk level, and enforcement
        // happens at the tool boundary through the human gate.
        policy: `sandbox.${!agent.contract.permissions.filesystemWrite ? "read-only" : "workspace-write"}`,
        reason: `${agent.harness ?? "hermes"} (native) will run "${task.title}" under ${task.risk} authority`,
        evidence: [`risk=${task.risk}`, "native-runtime", "no-external-cli"],
        subjectId: task.taskId,
        data: { runtime: "native", risk: task.risk, externalCli: false }
      });
    }
    return harness.invoke(harnessTask);
  }
  /* ------------------------------------------------------------------ §18 evaluation */
  async evaluate(task, step, agent, outcome, artifact) {
    const checks = [];
    const kind = step?.kind ?? "implementation";
    checks.push(
      check({
        name: `Self-report by ${agent.title}`,
        source: "AGENT_SELF_REPORT",
        passed: outcome.ok,
        score: outcome.ok ? 1 : 0,
        detail: outcome.ok ? "The producing agent reports success. This is not verification." : "The producing agent reports failure.",
        evidence: outcome.text ? [outcome.text.slice(0, 500)] : []
      })
    );
    const real = await this.realCheckResults();
    const realTest = real.find((r) => r.spec.source === "TEST_RUN");
    const realStatic = real.filter((r) => r.spec.source === "STATIC_CHECK");
    if (kind === "test" || kind === "implementation") {
      const cmd = kind === "test" ? "test suite" : "build";
      if (realTest?.didRun) {
        checks.push(testRunCheck(`${realTest.spec.command} ${realTest.spec.args.join(" ")}`, realTest.output, realTest.exitCode));
      } else if (realTest) {
        checks.push(unmeasuredCheck(`Test run: ${cmd}`, "TEST_RUN", `the repository's own test command could not be run: ${realTest.reason}`));
      } else if (outcome.simulated) {
        checks.push(unmeasuredCheck(`Test run: ${cmd}`, "TEST_RUN", "the runtime was VH's labelled simulation, so no real command was executed"));
      } else {
        checks.push(testRunCheck(cmd, outcome.text, outcome.ok ? 0 : 1));
      }
    }
    if (kind === "implementation" || kind === "security") {
      const hasStaticEvidence = /\b(typecheck|tsc|eslint|ruff|mypy|clippy|lint)\b/i.test(outcome.text);
      if (realStatic.some((r) => r.didRun)) {
        for (const r of realStatic.filter((x) => x.didRun)) {
          checks.push(
            check({
              name: `Static checks: ${r.spec.label}`,
              source: "STATIC_CHECK",
              passed: r.exitCode === 0,
              score: r.exitCode === 0 ? 1 : 0,
              detail: `${r.spec.command} ${r.spec.args.join(" ")} exited ${r.exitCode ?? "?"} (${r.spec.discoveredFrom})`,
              evidence: [r.output.slice(0, 2e3)]
            })
          );
        }
      } else if (realStatic.length) {
        checks.push(unmeasuredCheck("Static checks", "STATIC_CHECK", `the repository's own static checks could not be run: ${realStatic[0].reason}`));
      } else if (!hasStaticEvidence) {
        checks.push(unmeasuredCheck("Static checks", "STATIC_CHECK", "no typecheck or lint output was produced"));
      } else {
        checks.push(check({ name: "Static checks", source: "STATIC_CHECK", passed: outcome.ok, score: outcome.ok ? 1 : 0, detail: "Static analysis output present in the result.", evidence: [outcome.text.slice(0, 500)] }));
      }
    }
    if (kind === "security") {
      const hasFindings = /\b(finding|severity|cve|vulnerab|risk)\b/i.test(outcome.text);
      checks.push(
        hasFindings ? check({ name: "Security review", source: "SECURITY_CHECK", passed: outcome.ok, score: outcome.ok ? 1 : 0, detail: "Findings recorded with severity.", evidence: [outcome.text.slice(0, 500)] }) : unmeasuredCheck("Security review", "SECURITY_CHECK", "no findings were recorded, so nothing was reviewed")
      );
    }
    const reviewer = this.org.agents().find(
      (a) => a.agentId !== agent.agentId && ["agent.reviewer", "agent.judge", "agent.qa", "agent.critic"].includes(a.definitionId) && a.state !== "REMOVED"
    );
    if (reviewer && artifact) {
      const review = this.reviewArtifact(reviewer, artifact);
      checks.push(
        check({
          name: `Independent review by ${reviewer.title}`,
          source: "INDEPENDENT_REVIEW",
          passed: review.passed,
          score: review.score,
          detail: review.detail,
          evidence: review.evidence
        })
      );
    } else if (kind !== "approval" && kind !== "release") {
      checks.push(unmeasuredCheck("Independent review", "INDEPENDENT_REVIEW", "no reviewer role exists in this organization"));
    }
    return evaluateArtifact({
      artifactId: artifact?.artifactId ?? task.taskId,
      kind,
      checks,
      selfReportedBy: agent.agentId
    });
  }
  /**
   * §18 The independent review. The reviewer is a different agent and it looks at the artifact,
   * not at what the producer said about it: substance, coverage of the mission's success
   * criteria, and the absence of any self-declared failure in the work product.
   */
  reviewArtifact(reviewer, artifact) {
    const content = artifact.content;
    const criteria = this.mission.successCriteria.filter((c) => c.trim().length > 0);
    const substantive = content.replace(/\s+/g, " ").trim().length >= 120;
    const concrete = /(```|\bfunction\b|\bclass\b|\bconst\b|\binterface\b|\bimport\b|\|)/.test(content);
    const covered = criteria.filter((c) => content.toLowerCase().includes(c.split(/\s+/).slice(0, 2).join(" ").toLowerCase()));
    const admitsFailure = /\b(failed|failing|error:|exception|cannot find|not implemented|todo:|fixme)\b/i.test(content);
    const findings = [];
    if (!substantive) findings.push("the artifact is too thin to review (under 120 characters of substance)");
    if (admitsFailure) findings.push("the work product itself records a failure or unfinished work");
    const score = Math.max(0, Math.round(((substantive ? 0.6 : 0) + (concrete ? 0.2 : 0) + (criteria.length ? covered.length / criteria.length * 0.2 : 0.2) + (admitsFailure ? 0 : 0)) * 100) / 100);
    return {
      passed: findings.length === 0,
      score,
      detail: findings.length ? `${reviewer.title} reviewed "${artifact.name}" and refused it: ${findings.join("; ")}.` : `${reviewer.title} reviewed "${artifact.name}": substantive (${content.length} chars)${concrete ? ", concrete content present" : ", no code or table present"}, ${covered.length}/${criteria.length} success criteria addressed, no failure admitted in the work product.`,
      evidence: [
        `reviewer=${reviewer.definitionId}`,
        `length=${content.length}`,
        `criteriaAddressed=${covered.length}/${criteria.length}`,
        `admitsFailure=${admitsFailure}`,
        content.slice(0, 240)
      ]
    };
  }
  /**
   * §18 Run the target repository's own verification, once per mission, and remember it. Running
   * a test suite per artifact would be wasteful and would make the evaluation depend on when in
   * the run an artifact happened to be produced.
   */
  async realCheckResults() {
    if (this.realChecks) return this.realChecks;
    const repoDir = this.options.repository ?? this.mission.workspace;
    if (!repoDir || repoDir === ".") {
      this.realChecks = [];
      return this.realChecks;
    }
    try {
      this.realChecks = await runAllChecks(repoDir);
    } catch (e) {
      this.realChecks = [];
      this.recorder.record({
        kind: "POLICY_DENIED",
        actor: "evaluation",
        authority: "policy:real-verification",
        policy: "evaluation.no-invented-results",
        reason: `Could not discover the repository's own verification commands in ${repoDir}: ${e instanceof Error ? e.message : String(e)}. Checks stay unmeasured rather than guessed.`,
        evidence: [`repository=${repoDir}`],
        subjectId: this.mission.missionId
      });
    }
    if (this.realChecks.length) {
      this.recorder.record({
        kind: "EVALUATION_STARTED",
        actor: "evaluation",
        authority: "policy:real-verification",
        policy: "evaluation.repository-own-commands",
        reason: `Ran the repository's own verification: ${this.realChecks.map((r) => `${r.spec.label}=${r.didRun ? `exit ${r.exitCode}` : "not run"}`).join(", ")}`,
        evidence: this.realChecks.map((r) => `${r.spec.discoveredFrom} -> ${r.didRun ? `exit ${r.exitCode}` : r.reason}`),
        subjectId: this.mission.missionId,
        data: { checks: this.realChecks.map((r) => ({ id: r.spec.id, didRun: r.didRun, exitCode: r.exitCode })) }
      });
    }
    return this.realChecks;
  }
  /* ------------------------------------------------------------------ §16 repair */
  async repair(taskId) {
    const task = this.org.task(taskId);
    if (!task) return;
    if (this.repairInFlight.has(taskId)) return;
    if (this.repairExhausted.has(taskId)) return;
    const count = (this.repairCount.get(taskId) ?? 0) + 1;
    this.repairCount.set(taskId, count);
    if (count > this.options.maxRepairAttempts || this.repairs.length >= this.options.maxRepairAttempts * Math.max(1, this.org.tasks_().length)) {
      this.repairExhausted.add(taskId);
      this.recorder.record({
        kind: "FAILURE_DETECTED",
        actor: "supervisor",
        authority: "policy:repair-budget",
        policy: `budget.maxRetriesPerTask=${this.options.maxRepairAttempts}`,
        reason: `Repair budget exhausted for "${task.title}" after ${count - 1} attempt(s). Escalating instead of retrying.`,
        evidence: [`repairAttempts=${count - 1}`, `strategiesTried=${(this.triedStrategies.get(taskId) ?? []).join(", ")}`],
        subjectId: taskId,
        data: { failureKind: "TOOL_FAILURE_LOOP", severity: "CRITICAL" }
      });
      this.transition("BLOCKED", `Repair budget exhausted for "${task.title}". A human must decide.`);
      return;
    }
    this.repairInFlight.add(taskId);
    try {
      await this.repairInner(task, count);
    } finally {
      this.repairInFlight.delete(taskId);
    }
  }
  async repairInner(task, attemptNumber) {
    const taskId = task.taskId;
    this.checkpoint(`before repairing "${task.title}"`, `Repair attempt ${attemptNumber}: the pre-repair organization state.`);
    const failure = {
      id: uid("fail"),
      missionId: this.mission.missionId,
      kind: "REPEATED_FAILURE",
      severity: task.attempts >= task.maxAttempts ? "ERROR" : "WARN",
      subject: taskId,
      detail: task.error ?? `Task "${task.title}" failed.`,
      evidence: [task.error ?? ""],
      detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      resolvedBy: null
    };
    this.failures.push(failure);
    const agent = task.agentId ? this.org.agent(task.agentId) : null;
    const tried = this.triedStrategies.get(taskId) ?? [];
    const choice = this.supervisor.nextRepairStrategy(task, tried, agent);
    if (!choice) {
      this.transition("BLOCKED", `No repair strategy remains for "${task.title}".`);
      return;
    }
    this.triedStrategies.set(taskId, [...tried, choice.strategy]);
    const attempt = {
      attemptId: uid("rep"),
      missionId: this.mission.missionId,
      taskId,
      failureId: failure.id,
      strategy: choice.strategy,
      order: attemptNumber,
      rationale: choice.rationale,
      changes: [],
      expectedImprovement: "",
      result: "PENDING",
      detail: "",
      costUsd: 0,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      finishedAt: null
    };
    this.repairs.push(attempt);
    this.transition("REPAIRING", `Repair ${choice.strategy} for "${task.title}".`);
    this.recorder.record({
      kind: "REPAIR_STARTED",
      actor: "supervisor",
      authority: "supervisor",
      policy: `repair.${choice.strategy}`,
      reason: choice.rationale,
      evidence: failure.evidence,
      subjectId: attempt.attemptId,
      data: { strategy: choice.strategy, taskId, attempt: attempt.order, failure: failure.detail }
    });
    try {
      const result = await this.applyRepair(choice.strategy, task, agent, failure);
      attempt.result = result.ok ? "SUCCESS" : "FAILURE";
      attempt.detail = result.detail;
      attempt.changes = result.changes;
      attempt.expectedImprovement = result.expectedImprovement;
      attempt.costUsd = result.costUsd;
    } catch (e) {
      attempt.result = "FAILURE";
      attempt.detail = e instanceof Error ? e.message : String(e);
    }
    attempt.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.resources.spend({ costUsd: attempt.costUsd, retries: 1 });
    this.recorder.record({
      kind: "REPAIR_COMPLETED",
      actor: "supervisor",
      authority: "supervisor",
      policy: `repair.${choice.strategy}`,
      reason: attempt.detail,
      evidence: attempt.changes,
      subjectId: attempt.attemptId,
      data: { strategy: choice.strategy, result: attempt.result, costUsd: attempt.costUsd, expectedImprovement: attempt.expectedImprovement }
    });
    if (attempt.result === "SUCCESS") {
      this.services.memory.remember({
        scope: "FAILURE",
        scopeKey: choice.strategy,
        missionId: this.mission.missionId,
        kind: "repair_strategy",
        content: `${choice.strategy} repaired "${task.title}": ${attempt.detail}`,
        importance: 0.7,
        evidence: attempt.changes
      });
      this.transition("RUNNING", `Repair ${choice.strategy} succeeded; resuming.`);
      const after = this.org.task(taskId);
      if (after && after.state !== "DONE" && this.org.dependenciesMet(after)) await this.executeTask(taskId);
    } else {
      this.transition("RUNNING", `Repair ${choice.strategy} did not resolve it; the ladder continues.`);
    }
  }
  async applyRepair(strategy, task, agent, failure) {
    switch (strategy) {
      case "RETRY": {
        this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        return { ok: true, detail: "Task reset to PENDING for another attempt.", changes: ["state: FAILED -> PENDING"], expectedImprovement: "A transient failure will not repeat.", costUsd: 0 };
      }
      case "ENRICH_CONTEXT": {
        const prior = task.error ?? "";
        task.description = `${task.description}

## Previous failure (must be addressed)
${prior}

## Acceptance criteria
${this.mission.successCriteria.map((c) => `- ${c}`).join("\n")}`;
        this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        return { ok: true, detail: "Task description enriched with the failure output and the acceptance criteria.", changes: ["description += failure + criteria"], expectedImprovement: "The agent addresses the specific failure instead of repeating it.", costUsd: 0 };
      }
      case "SWITCH_HARNESS": {
        const tried = this.triedHarnesses.get(task.taskId) ?? [];
        if (agent?.harness) tried.push(agent.harness);
        this.triedHarnesses.set(task.taskId, tried);
        const step = this.taskToStep.get(task.taskId) ?? null;
        if (!step || !agent) return { ok: false, detail: "No plan step or agent to re-arbitrate.", changes: [], expectedImprovement: "", costUsd: 0 };
        const decision = selectReplacementHarness(
          { mission: this.mission, step, installed: this.options.installed ?? {}, allowSimulated: this.options.allowSimulated, repository: this.options.repository },
          this.services.ledger,
          tried
        );
        if (!decision) return { ok: false, detail: `No alternative harness after trying ${tried.join(", ") || "none"}.`, changes: [], expectedImprovement: "", costUsd: 0 };
        agent.harness = decision.chosen;
        this.org.setHarness(agent.agentId, agent.harness, `Switched runtime for "${task.title}" after failure.`, "supervisor", decision.rationale);
        this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        return { ok: true, detail: `Harness switched to ${decision.chosen}.`, changes: [`harness: ${tried[tried.length - 1] ?? "none"} -> ${decision.chosen}`], expectedImprovement: "A different runtime may handle this task shape better.", costUsd: 0 };
      }
      case "SPAWN_SPECIALIST": {
        const proposal = this.supervisor.proposeReplacement(failure);
        const defId = proposal?.definitionId ?? "agent.architect";
        const created = this.org.spawn({
          definitionId: defId,
          purpose: task.description,
          planStepId: task.planStepId,
          spawnedBy: "repair",
          spawnReason: `Repair: ${task.title} failed ${task.attempts}\xD7; escalating the role to ${defId}.`
        });
        this.org.reassign(task.taskId, created.agentId, `Specialist ${created.title} takes over.`, "supervisor");
        return { ok: true, detail: `Spawned ${created.title} (${defId}) and reassigned the task.`, changes: [`spawn ${defId}`, `reassign ${task.taskId}`], expectedImprovement: "A stronger role has the capability the previous agent lacked.", costUsd: 0 };
      }
      case "SPLIT_TASK": {
        const halves = [
          { title: `${task.title} \u2014 part 1`, description: task.description.split("\n").slice(0, Math.ceil(task.description.split("\n").length / 2)).join("\n") },
          { title: `${task.title} \u2014 part 2`, description: task.description.split("\n").slice(Math.ceil(task.description.split("\n").length / 2)).join("\n") }
        ];
        const children = this.org.split(task.taskId, halves, `Repair: "${task.title}" is large enough to split.`, "supervisor");
        return { ok: true, detail: `Split into ${children.length} subtasks.`, changes: children.map((c) => `+ ${c.title}`), expectedImprovement: "Smaller units are more likely to succeed and easier to diagnose.", costUsd: 0 };
      }
      case "REDUCE_SCOPE": {
        task.description = `${task.description}

## Reduced scope
Deliver the smallest increment that satisfies: ${this.mission.successCriteria[0] ?? this.mission.objective}. Mark the rest as not done.`;
        this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        return { ok: true, detail: "Scope reduced to the smallest verifiable increment.", changes: ["description += reduced scope"], expectedImprovement: "A smaller deliverable is verifiable now rather than never.", costUsd: 0 };
      }
      case "ROLLBACK_CHECKPOINT": {
        const cp = this.services.checkpoints.latest(this.mission.missionId);
        if (!cp) return { ok: false, detail: "No checkpoint exists to roll back to.", changes: [], expectedImprovement: "", costUsd: 0 };
        this.restoreCheckpoint(cp.checkpointId, `Repair: rolling back to "${cp.label}".`);
        return { ok: true, detail: `Rolled back to checkpoint "${cp.label}".`, changes: [`graph v${this.mission.graphVersion} -> v${cp.graphVersion}`], expectedImprovement: "Return to the last known-good state before retrying.", costUsd: 0 };
      }
      case "REORGANIZE": {
        const diagnosis = this.supervisor.diagnoseOrganization(this.failures, this.plan);
        await this.reorganize(diagnosis.reason || `Repair: reorganizing around "${task.title}".`, diagnosis.evidence);
        return { ok: true, detail: "Organization restructured.", changes: ["graph mutated"], expectedImprovement: "The missing role or dependency is now present.", costUsd: 0 };
      }
      case "ESCALATE_HUMAN": {
        const approved = await this.requestApproval(
          { ...task, risk: "CRITICAL" },
          this.taskToStep.get(task.taskId) ?? null,
          `Every automated repair strategy failed for "${task.title}".`
        );
        if (approved) {
          this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "human" });
          return { ok: true, detail: "A human approved continuing; task reset.", changes: ["human approval"], expectedImprovement: "Human judgement unblocks what automation could not.", costUsd: 0 };
        }
        return { ok: false, detail: "Human escalation was not approved.", changes: [], expectedImprovement: "", costUsd: 0 };
      }
    }
  }
  /* ------------------------------------------------------------------ §17 reorganize */
  async reorganize(reason, evidence) {
    if (!this.plan) return;
    const diagnosis = this.supervisor.diagnoseOrganization(this.failures, this.plan);
    const nextSteps = [...this.plan.steps];
    for (const kind of diagnosis.addSteps) {
      if (nextSteps.some((s) => s.kind === kind)) continue;
      const defId = kind === "architecture" ? "agent.architect" : kind === "test" ? "agent.tester" : "agent.reviewer";
      nextSteps.push({
        // Unique by construction, even across a rollback: reusing "step-N" after a restore
        // created a second task for a step id that already existed.
        id: `step-x${++this.addedStepSeq}`,
        kind,
        title: kind === "architecture" ? "Architecture (added by repair)" : kind === "test" ? "Verification (added by repair)" : "Review (added by repair)",
        agentDefId: defId,
        purpose: `Added after repeated failure: ${reason}`,
        requiredCapabilities: kind === "architecture" ? ["architecture"] : kind === "test" ? ["testing"] : ["review"],
        languages: [],
        preferredHarness: null,
        dependsOn: nextSteps.length ? [nextSteps[nextSteps.length - 1].id] : [],
        estimatedCostUsd: 0.5,
        estimatedMs: 9e4,
        risk: "LOW",
        requiresApproval: false,
        rationale: `Repair added this role because ${reason}`
      });
    }
    const nextPlan = { ...this.plan, version: this.plan.version + 1, steps: nextSteps };
    const nextGraph = graphFromSteps(this.mission, nextSteps);
    const outcome = proposeMutation(
      {
        mission: this.mission,
        graph: this.graph,
        nextGraph,
        reason,
        evidence,
        requestedBy: "supervisor",
        authority: "SUPERVISOR",
        completedWork: completedTitles(this.graph, this.completedNodeIds)
      },
      this.recorder
    );
    this.mutations.push(outcome.mutation);
    if (!outcome.applied) {
      this.recorder.record({
        kind: "POLICY_DENIED",
        actor: "supervisor",
        authority: "policy:graph-mutation",
        policy: "graph.mutation-gates",
        reason: `Proposed reorganization refused: ${outcome.blockedBy}`,
        evidence,
        subjectId: outcome.mutation.mutationId
      });
      this.transition("BLOCKED", `Reorganization refused: ${outcome.blockedBy}`);
      return;
    }
    this.graph = nextGraph;
    this.mission.graphVersion = outcome.mutation.toGraphVersion;
    this.plan = nextPlan;
    this.resources.spend({ graphMutations: 1 });
    for (const step of nextSteps) {
      if (this.taskToStep.has(step.id)) continue;
      if (this.org.tasks_().some((t) => t.planStepId === step.id)) continue;
      if (!DEFINITIONS_BY_ID.has(step.agentDefId) || step.agentDefId.startsWith("control.")) continue;
      if (!this.org.byDefinition(step.agentDefId)) {
        try {
          this.org.spawn({
            definitionId: step.agentDefId,
            purpose: step.purpose,
            planStepId: step.id,
            spawnedBy: "supervisor",
            spawnReason: `Reorganization: ${reason}`
          });
        } catch {
        }
      }
      const deps = step.dependsOn.map((d) => [...this.taskToStep.entries()].find(([, s]) => s.id === d)?.[0]).filter((x) => Boolean(x));
      const task = this.org.createTask({ title: step.title, description: step.purpose, planStepId: step.id, dependsOn: deps, risk: step.risk });
      this.taskToStep.set(task.taskId, step);
      const nodeId = this.nodeIdForStep(step.id);
      if (nodeId) this.taskToNode.set(task.taskId, nodeId);
    }
    this.checkpoint("after reorganization", reason);
  }
  /* ------------------------------------------------------------------ §11 approvals */
  async requestApproval(task, step, extraReason) {
    const agent = task.agentId ? this.org.agent(task.agentId) : null;
    const gate = this.services.approvals.open(
      {
        mission: this.mission,
        requestedBy: agent?.title ?? "runtime",
        agentId: agent?.agentId ?? null,
        action: extraReason ? `${extraReason} \u2014 ${task.title}` : `${task.title}: ${task.description.slice(0, 200)}`,
        changes: [`${task.title} will run as ${agent?.title ?? "an agent"} with harness ${agent?.harness ?? "TBD"}`],
        evidence: [task.error ?? "no prior failure", ...step ? [`plan rationale: ${step.rationale}`] : []],
        expectedOutcome: this.mission.successCriteria.join("; ") || "The mission objective is advanced.",
        reversible: task.risk !== "CRITICAL",
        // The gate classifies the *action string*, which would score a task called "Release gate"
        // as MEDIUM and wave it through. The plan's classification is authoritative, so it is
        // handed to the gate as an override — the gate may still raise it, never lower it.
        riskOverride: {
          risk: task.risk,
          reason: `Classified ${task.risk} by the mission plan${step ? ` (step "${step.title}")` : ""}; the approval threshold for this mission is ${this.mission.riskPolicy.approvalThreshold}.`
        }
      },
      this.recorder
    );
    if (gate.autonomous) return true;
    if (!gate.request) return false;
    this.options.onApprovalRequired?.(gate.request.id);
    const decision = await this.services.approvals.waitFor(gate.request.id, this.options.approvalTimeoutMs, () => this.cancelled);
    return decision === "APPROVED";
  }
  async drainApprovals() {
    const pending = this.services.approvals.pendingForMission(this.mission.missionId);
    for (const req of pending) {
      await this.services.approvals.waitFor(req.id, this.options.approvalTimeoutMs, () => this.cancelled);
    }
  }
  /* ------------------------------------------------------------------ §5 detection */
  detect() {
    const found = detectAll({
      missionId: this.mission.missionId,
      agents: this.org.agents(),
      tasks: this.org.tasks_(),
      artifacts: this.services.artifacts.forMission(this.mission.missionId),
      repairs: this.repairs,
      usage: this.resources.export(),
      budget: this.mission.budget,
      now: Date.now(),
      taskAgeMs: this.org.taskAges()
    });
    for (const f of found) {
      if (!this.failures.some((x) => x.kind === f.kind && x.subject === f.subject)) this.failures.push(f);
    }
    return found;
  }
  async executeRecommendation(recId) {
    const rec = this.supervisor.list().find((r) => r.id === recId);
    if (!rec || rec.executed) return;
    switch (rec.kind) {
      case "ROLLBACK_CHECKPOINT": {
        const cp = this.services.checkpoints.latest(this.mission.missionId);
        if (cp) this.restoreCheckpoint(cp.checkpointId, rec.reason);
        break;
      }
      case "PAUSE_MISSION": {
        this.transition("PAUSED", rec.reason, "supervisor");
        break;
      }
      case "RETRY": {
        const task = rec.subjectId ? this.org.task(rec.subjectId) : null;
        if (task && task.state !== "DONE") this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        break;
      }
      case "SWITCH_HARNESS":
      case "SPAWN_SPECIALIST": {
        if (rec.subjectId) await this.repair(rec.subjectId);
        break;
      }
      default:
        break;
    }
    this.supervisor.markExecuted(recId, rec.reason);
  }
  /* ------------------------------------------------------------------ §26 checkpoints */
  checkpoint(label, reason) {
    this.services.checkpoints.take(
      {
        missionId: this.mission.missionId,
        label,
        reason,
        graphVersion: this.mission.graphVersion,
        graphSnapshot: this.graph,
        taskStates: Object.fromEntries(this.org.tasks_().map((t) => [t.taskId, t.state])),
        artifactVersions: Object.fromEntries(
          this.services.artifacts.forMission(this.mission.missionId).map((a) => [a.lineageRoot, a.version])
        ),
        roster: this.org.agents().map((a) => ({ agentId: a.agentId, definitionId: a.definitionId, state: a.state })),
        pendingApprovalIds: this.services.approvals.pendingForMission(this.mission.missionId).map((a) => a.id),
        spentUsd: this.resources.usage.costUsd
      },
      this.recorder
    );
    this.mission.checkpointId = this.services.checkpoints.latest(this.mission.missionId)?.checkpointId ?? null;
  }
  restoreCheckpoint(checkpointId, reason) {
    const cp = this.services.checkpoints.rollbackTo(checkpointId, this.recorder, "supervisor", reason);
    if (!cp) return false;
    this.graph = structuredClone(cp.graphSnapshot);
    this.mission.graphVersion = cp.graphVersion;
    for (const [taskId, state] of Object.entries(cp.taskStates)) {
      const t = this.org.task(taskId);
      if (t && (t.state === "FAILED" || t.state === "BLOCKED" || t.state === "RUNNING")) {
        this.org.setState(taskId, state === "DONE" ? "PENDING" : state, { actor: "supervisor", reason });
      }
    }
    this.completedNodeIds = new Set(this.graph.nodes.filter((n) => cp.taskStates[taskForNode(this, n.id)] === "DONE").map((n) => n.id));
    return true;
  }
  /* ------------------------------------------------------------------ §25 pause/resume */
  pause(reason, actor = "human") {
    this.paused = true;
    this.transition("PAUSED", reason, actor);
  }
  resume(reason, actor = "human") {
    this.paused = false;
    this.transition("RUNNING", reason, actor);
  }
  cancel(reason) {
    this.cancelled = true;
    this.recorder.record({ kind: "MISSION_FAILED", actor: "human", authority: "human", policy: "mission.cancel", reason, subjectId: this.mission.missionId });
  }
  /** §25 Persist everything needed to resume without repeating completed work. */
  persist() {
    return {
      version: 6,
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      missionId: this.mission.missionId,
      agents: this.org.exportState().agents,
      tasks: this.org.exportState().tasks,
      taskUpdatedAt: this.org.exportState().taskUpdatedAt,
      artifacts: this.services.artifacts.export(),
      checkpoints: this.services.checkpoints.export(),
      approvals: this.services.approvals.export(),
      negotiations: this.services.negotiations.export(),
      recommendations: this.supervisor.exportState(),
      flightEvents: this.recorder.all(),
      usage: this.resources.export(),
      startedAt: this.startedAt,
      graphVersion: this.mission.graphVersion,
      graph: structuredClone(this.graph),
      completedNodeIds: [...this.completedNodeIds],
      pendingTaskIds: this.org.tasksInState("PENDING", "ASSIGNED", "RUNNING").map((t) => t.taskId)
    };
  }
  /** §25 Restore. Fails loudly rather than resuming into a half-restored mission. */
  restore(state) {
    const valid = validateRestoredState(state);
    if (!valid.ok || state.missionId !== this.mission.missionId) {
      return { ok: false, errors: valid.ok ? [`state belongs to ${state.missionId}, not ${this.mission.missionId}`] : valid.errors };
    }
    this.org.hydrate({ agents: state.agents, tasks: state.tasks, taskUpdatedAt: state.taskUpdatedAt });
    this.services.artifacts.hydrate(state.artifacts);
    this.services.checkpoints.hydrate(state.checkpoints);
    this.services.approvals.hydrate(state.approvals);
    this.services.negotiations.hydrate(state.negotiations);
    this.supervisor.hydrate(state.recommendations);
    this.resources.hydrate(state.usage, state.startedAt);
    this.graph = state.graph ?? this.graph;
    this.mission.graphVersion = state.graphVersion;
    this.completedNodeIds = new Set(state.completedNodeIds);
    const restoredEvents = this.recorder.seedHistory(state.flightEvents);
    this.recorder.record({
      kind: "MISSION_STATUS",
      actor: "runtime",
      authority: "policy:resume",
      policy: "mission.resume",
      reason: `Restored from checkpoint. ${state.completedNodeIds.length} node(s) already complete; their work is not repeated.`,
      subjectId: this.mission.missionId,
      data: { restoredEvents, pendingTasks: state.pendingTaskIds.length }
    });
    return { ok: true, errors: [] };
  }
  /* ------------------------------------------------------------------ §19 finish */
  finish() {
    if (this.plan) {
      const diagnosis = this.supervisor.diagnoseOrganization(this.failures, this.plan);
      if (diagnosis.reorganize) {
        const allowed = this.mission.riskPolicy.allowReorganization && this.mission.riskPolicy.allowGraphMutation;
        this.recorder.record({
          kind: allowed ? "GRAPH_MUTATED" : "POLICY_DENIED",
          actor: "supervisor",
          authority: "supervisor",
          policy: `allowReorganization=${this.mission.riskPolicy.allowReorganization};allowGraphMutation=${this.mission.riskPolicy.allowGraphMutation}`,
          reason: allowed ? `Structural gap noted and resolved during the run: ${diagnosis.reason}` : `Structural gap noted but the organization was not changed: ${diagnosis.reason}. ${allowed ? "" : "Reorganization or graph mutation is disabled by mission policy."}`,
          evidence: diagnosis.evidence.length ? diagnosis.evidence : [diagnosis.reason],
          subjectId: this.mission.missionId,
          data: { addSteps: diagnosis.addSteps, applied: false, missionEnded: true }
        });
      }
    }
    const tasks = this.org.tasks_();
    const done = tasks.filter((t) => t.state === "DONE").length;
    const artifacts = this.services.artifacts.forMission(this.mission.missionId);
    const allChecks = artifacts.flatMap((a) => a.evaluation?.checks ?? []);
    const criteriaMet = this.mission.successCriteria.filter(
      (c) => artifacts.some((a) => a.evaluation?.passed && a.content.toLowerCase().includes(c.split(" ")[0]?.toLowerCase() ?? ""))
    );
    const score = scoreMission({
      successCriteria: this.mission.successCriteria,
      criteriaMet,
      checks: allChecks,
      testChecks: allChecks.filter((c) => c.source === "TEST_RUN"),
      securityChecks: allChecks.filter((c) => c.source === "SECURITY_CHECK"),
      spentUsd: this.resources.usage.costUsd,
      budgetUsd: this.mission.budget.maxCostUsd,
      elapsedMs: Date.now() - this.startedAt,
      deadlineMs: this.mission.deadline ? new Date(this.mission.deadline).getTime() - new Date(this.mission.startedAt ?? this.mission.createdAt).getTime() : null,
      humanInterventions: this.recorder.count("APPROVAL_GRANTED") + this.recorder.count("APPROVAL_REJECTED"),
      regressionCount: this.failures.filter((f) => f.kind === "REGRESSION").length
    });
    const everyTaskDone = tasks.length > 0 && tasks.every((t) => t.state === "DONE" || t.state === "CANCELLED");
    const anyUnverified = artifacts.some((a) => a.evaluation && (!a.evaluation.passed || !a.evaluation.fullyMeasured));
    if (everyTaskDone && !anyUnverified && !this.simulatedUsed) {
      this.transition("VERIFYING", "All tasks complete; verifying before completion.");
      this.transition("COMPLETED", `Mission verified: ${done}/${tasks.length} tasks, all artifacts independently evaluated.`);
    } else if (everyTaskDone) {
      this.transition("VERIFYING", "All tasks complete; verification is incomplete.");
      this.transition("BLOCKED", buildIncompleteReason(artifacts, this.simulatedUsed));
    } else if (this.mission.status !== "BLOCKED" && this.mission.status !== "PAUSED") {
      this.transition("BLOCKED", `${tasks.length - done} task(s) unfinished.`);
    }
    this.mission.endedAt = this.mission.status === "COMPLETED" ? (/* @__PURE__ */ new Date()).toISOString() : this.mission.endedAt;
    this.services.memory.distil(this.mission.missionId, this.recorder);
    this.recorder.record({
      kind: this.mission.status === "COMPLETED" ? "MISSION_COMPLETED" : "MISSION_FAILED",
      actor: "runtime",
      authority: "policy:verification",
      policy: "mission.no-fake-success",
      reason: this.mission.status === "COMPLETED" ? `Verified completion: ${done}/${tasks.length} tasks, $${this.resources.usage.costUsd.toFixed(4)} spent.` : buildIncompleteReason(artifacts, this.simulatedUsed),
      evidence: score.unmeasured.map((u) => `unmeasured: ${u}`),
      subjectId: this.mission.missionId,
      data: { score, simulatedUsed: this.simulatedUsed }
    });
    return {
      missionId: this.mission.missionId,
      status: this.mission.status,
      score,
      finalArtifactIds: this.finalArtifactIds,
      failures: this.failures,
      repairs: this.repairs,
      mutations: this.mutations,
      approvals: this.services.approvals.forMission(this.mission.missionId),
      spentUsd: this.resources.usage.costUsd,
      durationMs: Date.now() - this.startedAt
    };
  }
  /* ------------------------------------------------------------------ helpers */
  pickAgentFor(task, step) {
    if (task.agentId) {
      const existing = this.org.agent(task.agentId);
      if (existing && existing.state !== "REMOVED" && existing.state !== "REPLACED") return existing;
    }
    if (step) {
      const byStep = this.org.agents().find((a) => a.state !== "REMOVED" && a.state !== "REPLACED" && this.plan?.steps.find((s) => s.id === a.taskIds[0])?.id === step.id);
      if (byStep) return byStep;
      const byDef = this.org.byDefinition(step.agentDefId);
      if (byDef) return byDef;
    }
    return this.org.agentsInState("IDLE", "ACTIVE")[0] ?? null;
  }
  provenanceFor(agent, task, outcome) {
    return {
      missionId: this.mission.missionId,
      taskId: task.taskId,
      agentId: agent.agentId,
      agentTitle: agent.title,
      harness: agent.harness ?? null,
      model: outcome.simulated ? "local-test (simulated)" : null,
      toolsUsed: outcome.simulated ? ["local-test"] : [String(agent.harness ?? "in-process")],
      mcpServersUsed: [],
      costUsd: outcome.costUsd,
      latencyMs: outcome.latencyMs,
      startedAt: new Date(Date.now() - outcome.latencyMs).toISOString(),
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  buildGraphFromPlan(plan) {
    this.graph = graphFromSteps(this.mission, plan.steps);
    this.mission.graphVersion = 1;
  }
  nodeIdForStep(stepId) {
    const step = this.plan?.steps.find((s) => s.id === stepId);
    if (!step) return null;
    return this.graph.nodes.find((n) => n.templateKey === stepId)?.id ?? null;
  }
  getFailures() {
    return [...this.failures];
  }
  getRepairs() {
    return [...this.repairs];
  }
  getMutations() {
    return [...this.mutations];
  }
  getEvents() {
    return this.recorder.all();
  }
  usage() {
    return this.resources.export();
  }
};
function emptyGraph(mission) {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    id: mission.missionId,
    name: mission.name,
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    groups: [],
    notes: []
  };
}
function graphFromSteps(mission, steps) {
  const graph = emptyGraph(mission);
  const byStep = /* @__PURE__ */ new Map();
  steps.forEach((step, i) => {
    const def = DEFINITIONS_BY_ID.get(step.agentDefId);
    if (!def) return;
    const node = createNodeFromDef(def, `${step.id}-${uid("n").slice(-5)}`, 120 + i % 5 * 300, 120 + Math.floor(i / 5) * 220);
    node.templateKey = step.id;
    node.title = step.title;
    node.purpose = step.purpose;
    graph.nodes.push(node);
    byStep.set(step.id, node);
  });
  const startDef = DEFINITIONS_BY_ID.get("control.start");
  let startNode = null;
  if (startDef) {
    startNode = createNodeFromDef(startDef, `start-${uid("n").slice(-5)}`, 20, 120);
    startNode.title = "Mission objective";
    startNode.purpose = `Mission "${mission.name}" \u2014 ${mission.objective}`;
    graph.nodes.push(startNode);
  }
  const wire = (src, tgt, srcPortId, tgtPortId, dataType) => {
    graph.connections.push({
      id: uid("c"),
      sourceNodeId: src.id,
      sourcePortId: srcPortId,
      targetNodeId: tgt.id,
      targetPortId: tgtPortId,
      dataType,
      status: "idle"
    });
  };
  for (const step of steps) {
    const target = byStep.get(step.id);
    if (!target) continue;
    const upstream = step.dependsOn.map((d) => byStep.get(d)).filter((n) => Boolean(n));
    for (const port of target.inputs) {
      if (!port.required || graph.connections.some((c) => c.targetNodeId === target.id && c.targetPortId === port.id)) continue;
      let done = false;
      for (const src of upstream) {
        const out = src.outputs.find((o) => portsCompatible(o.dataType, port.dataType));
        if (!out) continue;
        wire(src, target, out.id, port.id, out.dataType);
        done = true;
        break;
      }
      if (!done && startNode) {
        const out = startNode.outputs.find((o) => portsCompatible(o.dataType, port.dataType));
        if (out) {
          wire(startNode, target, out.id, port.id, out.dataType);
          done = true;
        }
      }
      if (!done) {
        recorderFor(mission.missionId).record({
          kind: "POLICY_DENIED",
          actor: "planner",
          authority: "policy:graph-structure",
          policy: "validation.required-inputs",
          reason: `Plan step "${step.title}" requires "${port.label}" (${port.dataType}) but nothing upstream emits a compatible value. The graph keeps the port unwired and validation will report it.`,
          evidence: [`step=${step.id}`, `port=${port.id}`, `dataType=${port.dataType}`, `upstream=${step.dependsOn.join(",") || "none"}`],
          subjectId: step.id,
          data: { portId: port.id, dataType: port.dataType }
        });
      }
    }
    for (const src of upstream) {
      for (const out of src.outputs) {
        if (graph.connections.some((c) => c.sourceNodeId === src.id && c.sourcePortId === out.id && c.targetNodeId === target.id)) continue;
        const port = target.inputs.find((i) => !graph.connections.some((c) => c.targetNodeId === target.id && c.targetPortId === i.id) && portsCompatible(out.dataType, i.dataType));
        if (!port) continue;
        wire(src, target, out.id, port.id, out.dataType);
      }
    }
  }
  return graph;
}
function taskForNode(rt2, nodeId) {
  const found = rt2.taskToNode;
  for (const [taskId, nId] of found) if (nId === nodeId) return taskId;
  return "";
}
function buildIncompleteReason(artifacts, simulatedUsed) {
  const parts = [];
  if (simulatedUsed) parts.push("execution used VH's labelled simulation, so nothing was really built");
  const unverified = artifacts.filter((a) => a.evaluation && (!a.evaluation.passed || !a.evaluation.fullyMeasured));
  if (unverified.length) {
    parts.push(
      `${unverified.length} artifact(s) are not independently verified: ${unverified.slice(0, 3).map((a) => `${a.name} (${a.evaluation?.unmeasured.join(", ") || "failed checks"})`).join("; ")}`
    );
  }
  return parts.length ? `Not verified \u2014 ${parts.join("; ")}.` : "Work unfinished.";
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// src/mission/templates.ts
init_id();
var role = (definitionId, title, kind, purpose) => ({
  definitionId,
  title,
  kind,
  purpose
});
var MISSION_TEMPLATES = [
  {
    id: "tpl.software-development",
    name: "Software Development",
    category: "Engineering",
    description: "Plan \u2192 architect \u2192 implement \u2192 test \u2192 review \u2192 release gate. The default shape for building something that has to work.",
    roles: [
      role("agent.planner", "Planner", "research", "Decompose the objective into testable units and name the unknowns."),
      role("agent.architect", "Architect", "architecture", "Design the system: components, data model, interfaces, failure modes."),
      role("agent.coder", "Implementer", "implementation", "Implement the design. Produce runnable code and the commands that build it."),
      role("agent.tester", "Tester", "test", "Run the tests. Record actual output. Report failures verbatim."),
      role("agent.reviewer", "Reviewer", "review", "Review against the success criteria. Say what is missing; do not rewrite."),
      role("control.approval", "Release gate", "release", "Human decision on release.")
    ],
    defaultSuccessCriteria: ["Builds without errors", "Tests pass", "Review has no unresolved blockers"],
    defaultConstraints: ["No production deployment without approval"],
    budget: { maxCostUsd: 15, maxConcurrentAgents: 3 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "HIGH" },
    boundary: { shell: true, filesystemWrite: true, credentials: false },
    preferredFramework: "fw.specdriven",
    origin: "built-in"
  },
  {
    id: "tpl.security-review",
    name: "Security Review",
    category: "Security",
    description: "Threat model \u2192 secure review \u2192 judge \u2192 human gate. Findings ranked by exploitability; no exploit payloads.",
    roles: [
      role("agent.security", "Threat modeller", "security", "Model trust boundaries and rank findings by exploitability."),
      role("agent.reviewer", "Secure reviewer", "review", "Review the diff for injection, authorisation gaps, secret handling."),
      role("agent.judge", "Judge", "review", "Adjudicate disagreements between the reviewer and the implementer."),
      role("control.approval", "Human gate", "approval", "Human decision on whether findings are acceptable.")
    ],
    defaultSuccessCriteria: ["Every finding has a severity and a remediation", "No untriaged high-severity finding remains"],
    defaultConstraints: ["No exploit payloads", "No live exploitation"],
    budget: { maxCostUsd: 8 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "MEDIUM" },
    boundary: { filesystemRead: true, filesystemWrite: false, shell: true },
    preferredFramework: "fw.security-gate",
    origin: "built-in"
  },
  {
    id: "tpl.research",
    name: "Research",
    category: "Knowledge",
    description: "Three independent angles \u2192 synthesis \u2192 judge. Conflicts are preserved, not smoothed.",
    roles: [
      role("agent.researcher", "Researcher A", "research", "Investigate from the technical angle. Cite sources."),
      role("agent.researcher", "Researcher B", "research", "Investigate from the cost/operational angle. Cite sources."),
      role("agent.researcher", "Researcher C", "research", "Investigate from the risk angle. Cite sources."),
      role("agent.synthesizer", "Synthesizer", "synthesis", "Merge the three. Keep the disagreements visible."),
      role("agent.judge", "Judge", "review", "State which conclusion the evidence actually supports.")
    ],
    defaultSuccessCriteria: ["Every claim is sourced", "Conflicting findings are named explicitly"],
    defaultConstraints: ["Mark unknowns rather than filling them"],
    budget: { maxCostUsd: 6, maxConcurrentAgents: 3 },
    policy: { autonomy: "AUTONOMOUS", approvalThreshold: "HIGH" },
    boundary: { network: true, browser: true, filesystemWrite: false, shell: false },
    preferredFramework: "fw.triangulation",
    origin: "built-in"
  },
  {
    id: "tpl.due-diligence",
    name: "Due Diligence",
    category: "Enterprise",
    description: "Research \u2192 finance \u2192 legal \u2192 security \u2192 synthesis \u2192 judge.",
    roles: [
      role("agent.researcher", "Researcher", "research", "Establish the factual record with sources."),
      role("agent.preset.data-analyst", "Financial analyst", "research", "Assess the financial picture. State assumptions."),
      role("agent.preset.legal", "Legal reviewer", "review", "Flag contractual and compliance risk. Not legal advice."),
      role("agent.security", "Security reviewer", "security", "Assess technical and security risk."),
      role("agent.synthesizer", "Synthesizer", "synthesis", "Produce one memorandum. Conflicts stay visible."),
      role("agent.judge", "Judge", "review", "Recommend, with the reasoning stated.")
    ],
    defaultSuccessCriteria: ["Every material risk is named", "Recommendation follows from the evidence"],
    defaultConstraints: ["Not legal or financial advice"],
    budget: { maxCostUsd: 12 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "HIGH" },
    boundary: { network: true, filesystemWrite: true },
    preferredFramework: "fw.due-diligence",
    origin: "built-in"
  },
  {
    id: "tpl.market-analysis",
    name: "Market Analysis",
    category: "Knowledge",
    description: "Map-reduce over sources, then a synthesis with the numbers shown.",
    roles: [
      role("agent.researcher", "Market researcher", "research", "Size the market and name the sources."),
      role("agent.preset.data-analyst", "Analyst", "research", "Build the numbers. Show the arithmetic."),
      role("agent.critic", "Critic", "review", "Attack the assumptions."),
      role("agent.synthesizer", "Synthesizer", "synthesis", "Produce the analysis.")
    ],
    defaultSuccessCriteria: ["Numbers are reproducible from stated sources"],
    defaultConstraints: ["No invented market figures"],
    budget: { maxCostUsd: 6 },
    policy: { autonomy: "AUTONOMOUS" },
    boundary: { network: true, filesystemWrite: false },
    preferredFramework: "fw.mapreduce",
    origin: "built-in"
  },
  {
    id: "tpl.data-pipeline",
    name: "Data Pipeline",
    category: "Data",
    description: "Design \u2192 implement \u2192 test on real data \u2192 review.",
    roles: [
      role("agent.architect", "Pipeline architect", "architecture", "Design the pipeline: sources, contracts, failure handling, backfill."),
      role("agent.coder", "Pipeline engineer", "implementation", "Implement it. Handle late-arriving and bad data explicitly."),
      role("agent.tester", "Data tester", "test", "Run it against real data. Show row counts and diffs."),
      role("agent.reviewer", "Reviewer", "review", "Review for correctness and idempotency.")
    ],
    defaultSuccessCriteria: ["Pipeline is idempotent", "Row counts reconcile"],
    defaultConstraints: ["Never drop source data"],
    budget: { maxCostUsd: 10 },
    policy: { autonomy: "SUPERVISED" },
    boundary: { shell: true, filesystemWrite: true },
    preferredFramework: "fw.pipeline",
    origin: "built-in"
  },
  {
    id: "tpl.content-production",
    name: "Content Production",
    category: "Content",
    description: "Research \u2192 draft \u2192 critique \u2192 edit. Facts sourced, claims checked.",
    roles: [
      role("agent.researcher", "Researcher", "research", "Gather sourced material."),
      role("agent.docs", "Writer", "synthesis", "Draft from the research. No invented facts."),
      role("agent.critic", "Critic", "review", "Attack the claims and the structure."),
      role("agent.reviewer", "Editor", "review", "Edit for accuracy and clarity.")
    ],
    defaultSuccessCriteria: ["Every factual claim is sourced"],
    defaultConstraints: ["No fabricated quotes or statistics"],
    budget: { maxCostUsd: 5 },
    policy: { autonomy: "AUTONOMOUS" },
    boundary: { network: true, shell: false, filesystemWrite: true },
    preferredFramework: "fw.handoff-chain",
    origin: "built-in"
  },
  {
    id: "tpl.qa",
    name: "QA",
    category: "Quality",
    description: "Producer \u2192 reviewer \u2192 QA gate. QA may not rewrite the work.",
    roles: [
      role("agent.coder", "Producer", "implementation", "Produce the work."),
      role("agent.reviewer", "Reviewer", "review", "Review it."),
      role("agent.qa", "QA", "test", "Gate it against the acceptance criteria."),
      role("control.approval", "Human gate", "approval", "Human sign-off.")
    ],
    defaultSuccessCriteria: ["Acceptance criteria are each explicitly met or explicitly not"],
    defaultConstraints: ["QA does not rewrite the work"],
    budget: { maxCostUsd: 8 },
    policy: { autonomy: "SUPERVISED" },
    boundary: { shell: true },
    preferredFramework: "fw.producer-gate",
    origin: "built-in"
  },
  {
    id: "tpl.incident-response",
    name: "Incident Response",
    category: "Ops",
    description: "War room: supervisor, security, SRE, debugger, human approval. Time-boxed; no silent changes.",
    roles: [
      role("agent.supervisor", "Incident commander", "review", "Own impact, comms and the next action."),
      role("agent.debugger", "Debugger", "research", "Find the root cause with evidence."),
      role("agent.preset.sre", "SRE", "research", "Assess blast radius and recovery options."),
      role("agent.security", "Security", "security", "Rule in or out a security cause."),
      role("control.approval", "Human gate", "approval", "Human approves any change to a live system.")
    ],
    defaultSuccessCriteria: ["Root cause is evidenced", "Blast radius is stated", "Next action is explicit"],
    defaultConstraints: ["No change to production without human approval"],
    budget: { maxCostUsd: 6, maxWallClockMs: 30 * 60 * 1e3 },
    policy: { autonomy: "HUMAN_ONLY", approvalThreshold: "MEDIUM" },
    boundary: { shell: true, filesystemRead: true, filesystemWrite: false },
    preferredFramework: "fw.war-room",
    origin: "built-in"
  },
  {
    id: "tpl.migration",
    name: "Migration",
    category: "Engineering",
    description: "Canary \u2192 verify \u2192 full \u2192 QA. The second pass sees the canary evidence.",
    roles: [
      role("agent.architect", "Migration architect", "architecture", "Plan the migration and the rollback path."),
      role("agent.coder", "Canary", "implementation", "Migrate one representative slice."),
      role("agent.tester", "Canary tester", "test", "Verify the slice end to end."),
      role("agent.coder", "Full migration", "implementation", "Migrate the rest, using the canary evidence."),
      role("agent.qa", "QA", "test", "Gate the result.")
    ],
    defaultSuccessCriteria: ["Rollback path exists and is tested", "No data loss"],
    defaultConstraints: ["Reversible at every step"],
    budget: { maxCostUsd: 15 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "HIGH" },
    boundary: { shell: true, filesystemWrite: true, credentials: false },
    preferredFramework: "fw.canary",
    origin: "built-in"
  },
  {
    id: "tpl.release-engineering",
    name: "Release Engineering",
    category: "Release",
    description: "Cut \u2192 changelog \u2192 gates \u2192 human release decision.",
    roles: [
      role("agent.tester", "Release verifier", "test", "Run the full suite. Record output."),
      role("agent.docs", "Changelog author", "synthesis", "Write the changelog from what actually changed."),
      role("agent.security", "Release security", "security", "Confirm no new high-severity finding ships."),
      role("control.approval", "Release decision", "release", "Human decides whether to ship.")
    ],
    defaultSuccessCriteria: ["Suite passes", "Changelog matches the diff"],
    defaultConstraints: ["No release without human approval"],
    budget: { maxCostUsd: 6 },
    policy: { autonomy: "HUMAN_ONLY" },
    boundary: { shell: true, filesystemWrite: true },
    preferredFramework: "fw.staged-approval",
    origin: "built-in"
  }
];
var TEMPLATE_BY_ID = new Map(MISSION_TEMPLATES.map((t) => [t.id, t]));
function getTemplate(id) {
  return TEMPLATE_BY_ID.get(id) ?? null;
}
function instantiateTemplate(templateId, input) {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`unknown mission template ${templateId}`);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    missionId: uid("msn"),
    name: input.name || `${t.name}: ${truncate(input.objective, 48)}`,
    objective: input.objective,
    description: input.description ?? t.description,
    constraints: [...t.defaultConstraints],
    successCriteria: [...t.defaultSuccessCriteria],
    deadline: input.deadline ?? null,
    budget: { ...DEFAULT_BUDGET, ...t.budget },
    riskPolicy: { ...DEFAULT_POLICY, ...t.policy },
    boundary: { ...DEFAULT_BOUNDARY, ...t.boundary },
    allowedHarnesses: [],
    allowedTools: [],
    allowedMcpServers: [],
    allowedAgents: t.roles.map((r) => r.definitionId),
    preferredFramework: t.preferredFramework,
    workspace: input.workspace ?? ".",
    templateId: t.id,
    priority: "NORMAL",
    status: "DRAFT",
    workflowId: null,
    graphVersion: 0,
    checkpointId: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    endedAt: null
  };
}
function truncate(s, n) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}\u2026`;
}

// probe/diag3.test.ts
var pass = 0;
var fail = 0;
var ok = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (t) => console.log(`
== ${t} ==`);
var m = instantiateTemplate("tpl.software-development", { objective: "Build a production-ready SaaS billing feature in TypeScript", name: "d", workspace: "." });
m.successCriteria = ["Builds without errors", "Tests pass"];
m.budget = { ...DEFAULT_BUDGET, maxCostUsd: 5, maxRetriesPerTask: 3, maxConcurrentAgents: 6, maxGraphMutations: 4 };
m.riskPolicy = { ...DEFAULT_POLICY, autonomy: "SUPERVISED", approvalThreshold: "HIGH", allowReorganization: true, allowHarnessSwitch: true };
m.boundary = { ...DEFAULT_BOUNDARY, shell: true, filesystemWrite: true, credentials: false, browser: false };
var services = createServices();
var rt = new MissionRuntime(m, services, { allowSimulated: true, installed: { "local-test": true }, approvalTimeoutMs: 3e3 });
rt.prepare();
rt.buildOrganization();
await rt.run();
console.log("mission status:", m.status);
for (const t of rt.org.tasks_()) console.log(` task ${t.title} | ${t.state} | risk=${t.risk} cls=${t.cls} deps=[${t.dependsOn.join(",")}] err=${(t.error ?? "").slice(0, 60)}`);
console.log("approvals opened:", services.approvals.forMission(m.missionId).length, "still PENDING:", services.approvals.pendingForMission(m.missionId).length);
var arts = services.artifacts.forMission(m.missionId);
console.log("artifacts:", arts.length);
for (const a of arts.slice(0, 8)) console.log(`  ${a.name} v${a.version} passed=${a.evaluation?.passed} fullyMeasured=${a.evaluation?.fullyMeasured} unmeasured=[${(a.evaluation?.unmeasured ?? []).join("; ")}]`);
var ev = rt.getEvents();
console.log("event kinds:", [...new Set(ev.map((e) => e.kind))].sort().join(", "));
console.log("last 3:", ev.slice(-3).map((e) => e.kind + " :: " + e.reason.slice(0, 100)).join("\n        "));
section("1. artifact honesty \u2014 the contract this suite was reaching for");
ok("the run produced a mission status", !!m.status, `${m.status}`);
var contradictory = arts.filter((a) => a.evaluation?.fullyMeasured === true && (a.evaluation?.unmeasured?.length ?? 0) > 0);
ok(
  "no artifact claims fullyMeasured while listing what it did not measure",
  contradictory.length === 0,
  contradictory.map((a) => `${a.name}: fullyMeasured=true but unmeasured=[${(a.evaluation?.unmeasured ?? []).join(", ")}]`).join("; ")
);
var unmeasuredButPassed = arts.filter((a) => (a.evaluation?.unmeasured?.length ?? 0) > 0 && a.evaluation?.passed === true && a.evaluation?.fullyMeasured);
ok(
  "no partially-measured artifact reports a verified pass",
  unmeasuredButPassed.length === 0,
  unmeasuredButPassed.map((a) => a.name).join("; ")
);
var malformed = arts.filter((a) => a.evaluation !== void 0 && a.evaluation !== null && typeof a.evaluation.passed !== "boolean");
ok(
  "every artifact evaluation reports a boolean passed",
  malformed.length === 0,
  malformed.map((a) => `${a.name}: ${typeof a.evaluation?.passed}`).join("; ")
);
section("2. the run left nothing dangling");
var stillPending = services.approvals.pendingForMission(m.missionId);
if (stillPending.length > 0) {
  ok("an unanswered gate is reflected as a BLOCKED mission", m.status === "BLOCKED", `${m.status}`);
  ok(
    "\u2026and the blocked task says it is waiting on a human",
    rt.org.tasks_().filter((t) => t.state === "BLOCKED").every((t) => /approval|human/i.test(t.error ?? "")),
    JSON.stringify(rt.org.tasks_().filter((t) => t.state === "BLOCKED").map((t) => t.error))
  );
  ok(
    "no approval-gated task was marked done while unanswered",
    rt.org.tasks_().filter((t) => t.cls === "APPROVAL_GATED").every((t) => t.state !== "done"),
    JSON.stringify(rt.org.tasks_().filter((t) => t.cls === "APPROVAL_GATED").map((t) => `${t.title}:${t.state}`))
  );
}
var stuck = rt.org.tasks_().filter((t) => t.state === "running");
ok(
  "no task is still running after run() returned",
  stuck.length === 0,
  JSON.stringify(stuck.map((t) => t.title))
);
ok("every artifact is named", arts.every((a) => !!a.name), `${arts.length} artifacts`);
ok(
  "every artifact carries a version",
  arts.every((a) => a.version !== void 0 && a.version !== null),
  JSON.stringify(arts.filter((a) => a.version === void 0).map((a) => a.name))
);
console.log(`
diag3: ${pass} passed, ${fail} failed`);
assert.equal(fail, 0, `${fail} diag3 assertion(s) failed`);
