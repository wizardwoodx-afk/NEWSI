#!/bin/sh
# SelfImpulse — zero-dependency verification (built on the MJ engine).
#
# For the reviewer on a machine WITHOUT node_modules and WITHOUT network.
# Exactly one gate needs nothing but Node >= 20: the offline verification
# pack — every pre-bundled probe suite under verify/suites/, zero install,
# zero network. The runner reports the exact suite count; this script never
# hardcodes one (the 18.6.0 review caught a stale count here — fixed in
# 18.7.0 by making the header derive from the tree itself). Release identity
# lives in verify/BUILD-INFO.txt; the runner prints the summary of record.
#
# The protocol selftest (`node protocol/test/selftest.js`) is NOT zero-dep
# (it needs @hpke/core); run it after `cd protocol && npm install`. The full
# dev gates are listed in docs/VERIFICATION.md and reproduce after
# `npm install` at the root.
set -e
echo "== offline verification pack — $(ls verify/suites | grep -c '\.mjs$') bundled suites, zero deps, zero network =="
head -1 verify/BUILD-INFO.txt
node verify/run.mjs
