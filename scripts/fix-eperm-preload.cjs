'use strict';
/**
 * Preload script injected into Node.js processes via NODE_OPTIONS --require.
 *
 * On Windows 10 Build 1803, any fs operation (readdir, lstat, stat, rm, etc.)
 * on directories whose name contains '+' (e.g. .react-router/types/.../+types)
 * returns EPERM. This patch intercepts those calls so that:
 *
 *  - mkdir / mkdirSync / promises.mkdir  for a '+types' path → silent no-op
 *  - writeFile / writeFileSync / promises.writeFile inside '+types' → silent no-op
 *  - readdir / readdirSync / promises.readdir  EPERM → empty array
 *  - lstat / lstatSync / promises.lstat         EPERM → ENOENT (so rm(force) skips it)
 *  - stat  / statSync  / promises.stat          EPERM → ENOENT
 *  - rm    / rmSync    / promises.rm            EPERM → silently ignored
 *  - unlink / unlinkSync / promises.unlink      EPERM → silently ignored
 *  - rmdir / rmdirSync / promises.rmdir         EPERM → silently ignored
 */
const fs = require('fs');
const path = require('path');

function hasPlus(p) {
  return String(p).includes('+');
}

function makeEnoent(syscall, p) {
  const e = new Error("ENOENT: no such file or directory, " + syscall + " '" + p + "'");
  e.code = 'ENOENT';
  e.errno = -4058;
  e.syscall = syscall;
  e.path = String(p);
  return e;
}

// ── mkdir ──────────────────────────────────────────────────────────────────
const _mkdir = fs.mkdir;
fs.mkdir = function (p, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  if (hasPlus(p)) return cb(null);
  _mkdir(p, opts, cb);
};
const _mkdirSync = fs.mkdirSync;
fs.mkdirSync = function (p, opts) {
  if (hasPlus(p)) return;
  return _mkdirSync(p, opts);
};
const _mkdirP = fs.promises.mkdir;
fs.promises.mkdir = function (p, opts) {
  if (hasPlus(p)) return Promise.resolve();
  return _mkdirP(p, opts).catch(function (e) {
    if (e.code === 'EPERM') return;
    throw e;
  });
};

// ── writeFile ──────────────────────────────────────────────────────────────
const _writeFile = fs.writeFile;
fs.writeFile = function (p, data, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  if (hasPlus(p)) return cb(null);
  _writeFile(p, data, opts, cb);
};
const _writeFileSync = fs.writeFileSync;
fs.writeFileSync = function (p, data, opts) {
  if (hasPlus(p)) return;
  return _writeFileSync(p, data, opts);
};
const _writeFileP = fs.promises.writeFile;
fs.promises.writeFile = function (p, data, opts) {
  if (hasPlus(p)) return Promise.resolve();
  return _writeFileP(p, data, opts).catch(function (e) {
    if (e.code === 'EPERM') return;
    throw e;
  });
};

// ── readdir ────────────────────────────────────────────────────────────────
const _readdir = fs.readdir;
fs.readdir = function (p, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  _readdir(p, opts, function (err, files) {
    if (err && err.code === 'EPERM') return cb(null, []);
    cb(err, files);
  });
};
const _readdirSync = fs.readdirSync;
fs.readdirSync = function (p, opts) {
  try { return _readdirSync(p, opts); }
  catch (e) { if (e.code === 'EPERM') return []; throw e; }
};
const _readdirP = fs.promises.readdir;
fs.promises.readdir = function (p, opts) {
  return _readdirP(p, opts).catch(function (e) {
    if (e.code === 'EPERM') return [];
    throw e;
  });
};

// ── lstat ──────────────────────────────────────────────────────────────────
const _lstat = fs.lstat;
fs.lstat = function (p, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  _lstat(p, opts, function (err, stats) {
    if (err && err.code === 'EPERM') return cb(makeEnoent('lstat', p));
    cb(err, stats);
  });
};
const _lstatSync = fs.lstatSync;
fs.lstatSync = function (p, opts) {
  try { return _lstatSync(p, opts); }
  catch (e) { if (e.code === 'EPERM') throw makeEnoent('lstat', p); throw e; }
};
const _lstatP = fs.promises.lstat;
fs.promises.lstat = function (p, opts) {
  return _lstatP(p, opts).catch(function (e) {
    if (e.code === 'EPERM') throw makeEnoent('lstat', p);
    throw e;
  });
};

// ── stat ───────────────────────────────────────────────────────────────────
const _stat = fs.stat;
fs.stat = function (p, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  _stat(p, opts, function (err, stats) {
    if (err && err.code === 'EPERM') return cb(makeEnoent('stat', p));
    cb(err, stats);
  });
};
const _statSync = fs.statSync;
fs.statSync = function (p, opts) {
  try { return _statSync(p, opts); }
  catch (e) { if (e.code === 'EPERM') throw makeEnoent('stat', p); throw e; }
};
const _statP = fs.promises.stat;
fs.promises.stat = function (p, opts) {
  return _statP(p, opts).catch(function (e) {
    if (e.code === 'EPERM') throw makeEnoent('stat', p);
    throw e;
  });
};

// ── rm (custom recursive to bypass native libuv which ignores JS patches) ──
// fs.promises.rm with {recursive:true} uses native C++ code internally and
// never calls our patched fs.promises.rmdir/readdir/lstat, so we replace it
// with a pure-JS recursive implementation that goes through our patched APIs.

async function safeRmRecursive(p) {
  var stats;
  try { stats = await _lstatP(p); }
  catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EPERM') return;
    throw e;
  }
  if (stats.isDirectory()) {
    var entries = [];
    try { entries = await _readdirP(p); }
    catch (e) { if (e.code === 'EPERM') entries = []; else throw e; }
    for (var i = 0; i < entries.length; i++) {
      await safeRmRecursive(path.join(p, typeof entries[i] === 'string' ? entries[i] : entries[i].name));
    }
    try { await _rmdirP(p); }
    catch (e) { if (e.code === 'ENOTEMPTY' || e.code === 'EPERM') return; throw e; }
  } else {
    try { await _unlinkP(p); }
    catch (e) { if (e.code === 'EPERM') return; throw e; }
  }
}

const _rmP = fs.promises.rm;
if (_rmP) {
  fs.promises.rm = function (p, opts) {
    if (opts && opts.recursive) return safeRmRecursive(String(p));
    return _rmP(p, opts).catch(function (e) {
      if (e.code === 'EPERM' || e.code === 'ENOTEMPTY') return;
      throw e;
    });
  };
}
const _rm = fs.rm;
if (_rm) {
  fs.rm = function (p, opts, cb) {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    if (opts && opts.recursive) {
      safeRmRecursive(String(p)).then(function () { cb(null); }, cb);
      return;
    }
    _rm(p, opts, function (err) {
      if (err && (err.code === 'EPERM' || err.code === 'ENOTEMPTY')) return cb(null);
      cb(err);
    });
  };
}
const _rmSync = fs.rmSync;
if (_rmSync) {
  fs.rmSync = function (p, opts) {
    try { return _rmSync(p, opts); }
    catch (e) { if (e.code === 'EPERM' || e.code === 'ENOTEMPTY') return; throw e; }
  };
}

const _rmdir = fs.rmdir;
fs.rmdir = function (p, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  _rmdir(p, opts, function (err) {
    if (err && (err.code === 'EPERM' || err.code === 'ENOTEMPTY')) return cb(null);
    cb(err);
  });
};
const _rmdirSync = fs.rmdirSync;
fs.rmdirSync = function (p, opts) {
  try { return _rmdirSync(p, opts); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'ENOTEMPTY') return; throw e; }
};
const _rmdirP = fs.promises.rmdir;
fs.promises.rmdir = function (p, opts) {
  return _rmdirP(p, opts).catch(function (e) {
    if (e.code === 'EPERM' || e.code === 'ENOTEMPTY') return;
    throw e;
  });
};

const _unlink = fs.unlink;
fs.unlink = function (p, cb) {
  _unlink(p, function (err) {
    if (err && err.code === 'EPERM') return cb(null);
    cb(err);
  });
};
const _unlinkSync = fs.unlinkSync;
fs.unlinkSync = function (p) {
  try { return _unlinkSync(p); }
  catch (e) { if (e.code === 'EPERM') return; throw e; }
};
const _unlinkP = fs.promises.unlink;
fs.promises.unlink = function (p) {
  return _unlinkP(p).catch(function (e) {
    if (e.code === 'EPERM') return;
    throw e;
  });
};
