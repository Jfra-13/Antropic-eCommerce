#!/bin/bash
set -e
pnpm install --frozen-lockfile
# `migrate`, never `push`: after a merge the local database must end up at the same schema
# every other environment will reach, which is the migrations replayed in order. `push` would
# diff against whatever this machine happens to contain and quietly produce something else.
pnpm --filter @workspace/db run migrate
