import { describe, expect, it } from 'vitest';
import type { FileEntry, OctoPrintSettings } from '../api/types';
import { recentFiles, thumbnailUrl } from './files';
import { idleMode, type IdleInput } from './idle';
import { parseLayerInfo } from './layer';
import { clearsNotice, LOCAL_ACTION_WINDOW_MS, noticeForEvent } from './notices';
import { applyTuneLines, createTuneState, fanPercent, fanValue } from './tune';
import { resolveWebcam, STREAM_START_TIMEOUT_MS, streamHealth, webcamTransform } from './webcam';

describe('tune overrides from the terminal log', () => {
  it('tracks fan, feed rate and flow from sent commands (file lines included)', () => {
    const state = createTuneState();
    expect(state).toEqual({ feedrate: 100, flow: 100, fan: null });
    expect(
      applyTuneLines(state, [
        'Send: N12 M106 S127*34',
        'Recv: ok',
        'Send: M220 S110',
        'Send: M221 S95',
      ]),
    ).toBe(true);
    expect(state).toEqual({ feedrate: 110, flow: 95, fan: 50 });

    applyTuneLines(state, ['Send: N13 M107*20']);
    expect(state.fan).toBe(0);
    applyTuneLines(state, ['Send: M106']);
    expect(state.fan).toBe(100);
  });

  it('ignores other fans and extruders, report-only and look-alike commands', () => {
    const state = createTuneState();
    const changed = applyTuneLines(state, [
      'Send: M106 P1 S255',
      'Send: M221 T1 S80',
      'Send: M220',
      'Send: M220 B',
      'Send: M1060 S3',
      'Send: G1 X10 ; M106 S255 in a comment',
      'Recv: echo:E1 Flow: 90%',
    ]);
    expect(changed).toBe(false);
    expect(state).toEqual(createTuneState());
  });

  it('reads Marlin reports of M220 and M221', () => {
    const state = createTuneState();
    applyTuneLines(state, ['Recv: FR:120%', 'Recv: echo:E0 Flow: 97%']);
    expect(state.feedrate).toBe(120);
    expect(state.flow).toBe(97);
  });

  it('converts between percent and M106 values', () => {
    expect(fanPercent(255)).toBe(100);
    expect(fanPercent(0)).toBe(0);
    expect(fanPercent(undefined)).toBe(100);
    expect(fanValue(50)).toBe(128);
    expect(fanValue(140)).toBe(255);
    expect(fanPercent(fanValue(75))).toBe(75);
  });
});

describe('DisplayLayerProgress layer info', () => {
  it('reads the socket payload and the REST values', () => {
    expect(parseLayerInfo({ currentLayer: '12', totalLayer: '80', fanspeed: '100%' })).toEqual({
      current: 12,
      total: 80,
    });
    expect(parseLayerInfo({ layer: { current: '3', total: '40' } })).toEqual({ current: 3, total: 40 });
  });

  it('returns null when the plugin knows nothing', () => {
    expect(parseLayerInfo({ currentLayer: '-', totalLayer: '-' })).toBeNull();
    expect(parseLayerInfo({ currentLayer: '5', totalLayer: '0' })).toBeNull();
    expect(parseLayerInfo({ stateMessage: 'x' })).toBeNull();
    expect(parseLayerInfo(null)).toBeNull();
  });
});

describe('webcam source', () => {
  const settings: OctoPrintSettings = {
    webcam: {
      webcamEnabled: true,
      streamUrl: '/webcam/?action=stream',
      snapshotUrl: 'http://localhost:8080/?action=snapshot',
      webcams: [
        {
          name: 'classic',
          displayName: 'Classic Webcam',
          provider: 'classicwebcam',
          canSnapshot: true,
          flipH: true,
          flipV: false,
          rotate90: false,
          compat: { stream: '/webcam/?action=stream', snapshot: 'http://localhost:8080/?action=snapshot', streamRatio: '4:3' },
        },
      ],
    },
  };

  it('uses the first OctoPrint webcam (relative URL through the agent)', () => {
    const source = resolveWebcam(settings);
    expect(source?.stream).toBe('/webcam/?action=stream');
    expect(source?.snapshot).toBe('http://localhost:8080/?action=snapshot');
    expect(source?.ratio).toBeCloseTo(4 / 3);
    expect(source && webcamTransform(source)).toBe('scaleX(-1)');
  });

  it('prefers the manual URL and handles disabled or missing webcams', () => {
    expect(resolveWebcam(settings, ' http://cam.local/stream ')?.stream).toBe('http://cam.local/stream');
    expect(resolveWebcam({ webcam: { ...settings.webcam, webcamEnabled: false } })).toBeNull();
    expect(resolveWebcam({ webcam: { streamUrl: 'rtsp://x' } })).toBeNull();
    expect(resolveWebcam(null)).toBeNull();
    expect(resolveWebcam(null, '/webcam/?action=stream')?.stream).toBe('/webcam/?action=stream');
    expect(webcamTransform({ flipH: false, flipV: true, rotate90: true })).toBe('rotate(-90deg) scaleY(-1)');
  });
});

describe('webcam stream health', () => {
  it('is fine while playing or still starting', () => {
    expect(streamHealth({ loaded: true, naturalWidth: 640, sinceMs: 60_000 })).toBe('ok');
    expect(streamHealth({ loaded: false, naturalWidth: 0, sinceMs: 2000 })).toBe('ok');
  });
  it('notices a broken stream and a first frame that never comes', () => {
    expect(streamHealth({ loaded: true, naturalWidth: 0, sinceMs: 5000 })).toBe('lost');
    expect(streamHealth({ loaded: false, naturalWidth: 0, sinceMs: STREAM_START_TIMEOUT_MS + 1 })).toBe('stuck');
  });
});

describe('idle mode', () => {
  const base: IdleInput = {
    idleMs: 0,
    screensaver: { enabled: true, timeoutMin: 5 },
    screenOff: { enabled: true, timeoutMin: 30 },
    busy: false,
    attention: false,
  };
  const min = (m: number) => m * 60_000;

  it('goes screensaver, then screen off', () => {
    expect(idleMode({ ...base, idleMs: min(4.9) })).toBe('active');
    expect(idleMode({ ...base, idleMs: min(5) })).toBe('screensaver');
    expect(idleMode({ ...base, idleMs: min(31) })).toBe('off');
  });

  it('never turns the screen off with a job, and stays awake for the user', () => {
    expect(idleMode({ ...base, idleMs: min(60), busy: true })).toBe('screensaver');
    expect(idleMode({ ...base, idleMs: min(60), attention: true })).toBe('active');
  });

  it('respects disabled options', () => {
    const noSaver = { ...base, screensaver: { enabled: false, timeoutMin: 5 } };
    expect(idleMode({ ...noSaver, idleMs: min(10) })).toBe('active');
    expect(idleMode({ ...noSaver, idleMs: min(40) })).toBe('off');
    const noOff = { ...base, screenOff: { enabled: false, timeoutMin: 30 } };
    expect(idleMode({ ...noOff, idleMs: min(40) })).toBe('screensaver');
  });
});

describe('print notices', () => {
  const file = { name: 'cube.gcode', path: 'examples/cube.gcode', origin: 'local', size: 10 };
  const now = 1_000_000;

  it('announces finished and failed prints with a beep', () => {
    const done = noticeForEvent('PrintDone', { ...file, time: 3600 }, {}, now);
    expect(done).toEqual({
      notice: { kind: 'done', file: 'cube.gcode', origin: 'local', path: 'examples/cube.gcode', time: 3600 },
      beep: true,
    });
    const failed = noticeForEvent('PrintFailed', { ...file, time: 12, reason: 'error' }, {}, now);
    expect(failed.notice?.kind).toBe('failed');
    expect(failed.beep).toBe(true);
  });

  it('skips pauses and cancels requested from this screen', () => {
    const local = { pauseAt: now - 2000, cancelAt: now - 5000 };
    expect(noticeForEvent('PrintPaused', file, local, now).notice).toBeNull();
    expect(noticeForEvent('PrintFailed', { ...file, reason: 'cancelled' }, local, now).notice).toBeNull();

    const old = { pauseAt: now - LOCAL_ACTION_WINDOW_MS - 1 };
    expect(noticeForEvent('PrintPaused', file, old, now).notice?.kind).toBe('paused');
    const remote = noticeForEvent('PrintFailed', { ...file, reason: 'cancelled' }, {}, now);
    expect(remote).toMatchObject({ notice: { kind: 'cancelled' }, beep: false });
  });

  it('ignores other events and clears stale notices', () => {
    expect(noticeForEvent('PrintStarted', file, {}, now).notice).toBeNull();
    const paused = noticeForEvent('PrintPaused', file, {}, now).notice!;
    expect(clearsNotice('PrintResumed', paused)).toBe(true);
    const done = noticeForEvent('PrintDone', file, {}, now).notice!;
    expect(clearsNotice('PrintResumed', done)).toBe(false);
    expect(clearsNotice('PrintStarted', done)).toBe(true);
  });
});

describe('recent files and thumbnails', () => {
  const entry = (path: string, date: number, printed?: number): FileEntry => ({
    name: path.split('/').pop()!,
    display: path,
    path,
    type: 'machinecode',
    typePath: ['machinecode', 'gcode'],
    origin: 'local',
    date,
    prints: printed ? { success: 1, failure: 0, last: { date: printed, success: true } } : undefined,
  });

  it('orders by last print or upload, across folders', () => {
    const tree: FileEntry[] = [
      entry('a.gcode', 100),
      {
        ...entry('dir', 0),
        type: 'folder',
        typePath: ['folder'],
        children: [entry('dir/b.gcode', 50, 400), entry('dir/c.gcode', 300)],
      },
    ];
    expect(recentFiles(tree, 2).map((e) => e.path)).toEqual(['dir/b.gcode', 'dir/c.gcode']);
  });

  it('builds plugin thumbnail URLs through the proxy', () => {
    expect(thumbnailUrl({ thumbnail: 'plugin/prusaslicerthumbnails/thumbnail/a.png?1' })).toBe(
      '/plugin/prusaslicerthumbnails/thumbnail/a.png?1',
    );
    expect(thumbnailUrl({ thumbnail: 'http://octoprint:5000/x.png' })).toBeNull();
    expect(thumbnailUrl({})).toBeNull();
    expect(thumbnailUrl(null)).toBeNull();
  });
});
