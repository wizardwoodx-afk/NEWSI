#!/usr/bin/env node
/**
 * generate-federation-batch.mjs — thin shim. The compile step lives in
 * `tools/generate-batch.mjs` so three batches cannot drift into three
 * implementations. This name is kept because probes, docs and build logs
 * reference it.
 */
import { runBatch } from "./generate-batch.mjs";

process.exit((await runBatch("federation")) ? 0 : 1);
