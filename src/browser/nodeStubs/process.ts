// Browser stub for `node:process`. Throws on access so any code path that
// reaches a process-only primitive surfaces with a stated cause in the
// browser rather than a silent undefined.
const processStub = {
  env: new Proxy({}, { get: () => undefined }),
  platform: "browser",
  cwd: () => "/",
  nextTick: (fn: () => void) => Promise.resolve().then(fn),
};
export default processStub;
export const env = processStub.env;
export const platform = processStub.platform;
export const cwd = processStub.cwd;
export const nextTick = processStub.nextTick;
