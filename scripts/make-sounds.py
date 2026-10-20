"""
Makes every sound in assets/sounds/ from scratch (no samples, nothing to license).

  python3 scripts/make-sounds.py assets/sounds /tmp/sounds-wav

Needs numpy and ffmpeg. The second folder holds the intermediate WAVs.
"""
import numpy as np, wave, subprocess, sys, os
SR = 44100
OUT = sys.argv[1]; TMP = sys.argv[2]
rng = np.random.default_rng(7)
def t(sec): return np.arange(int(SR*sec))/SR
def env(n, a, d, sustain=0.0, r=None):
    """attack seconds, exponential decay time-constant"""
    x = np.arange(n)/SR
    e = np.minimum(1, x/max(a,1e-4)) * np.exp(-np.maximum(0, x-a)/d)
    return e
def adsr(n, a, r):
    x = np.arange(n)/SR; L = n/SR
    return np.clip(np.minimum(x/a, (L-x)/r), 0, 1)
def note(f): return 440*2**((f-69)/12)
def lp(x, k):  # one-pole low-pass, k in 0..1 (smaller = darker)
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += k*(v-acc); y[i] = acc
    return y
def save(name, x, peak=0.9, bitrate='96k', sr=SR):
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    pcm = (x*32767).astype(np.int16)
    w = os.path.join(TMP, name + '.wav')
    with wave.open(w, 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr); f.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', w, '-ac', '1', '-b:a', bitrate, os.path.join(OUT, name + '.mp3')], check=True)

# tap: a soft wooden click
x = t(0.06); s = np.sin(2*np.pi*1800*x)*env(len(x), 0.001, 0.008) + 0.4*np.sin(2*np.pi*900*x)*env(len(x), 0.001, 0.015)
save('tap', s, 0.5)

# buy: bright coin ching, two partials up a fifth
x = t(0.35)
s = (np.sin(2*np.pi*note(88)*x) + 0.6*np.sin(2*np.pi*note(95)*x)*(x > 0.06)) * env(len(x), 0.002, 0.09)
s += 0.25*np.sin(2*np.pi*note(100)*x)*env(len(x), 0.002, 0.05)
save('buy', s, 0.6)

# cash: ka-ching, a quick rising coin arpeggio over a shimmer
x = t(0.9); s = np.zeros_like(x)
for i, n in enumerate([84, 88, 91, 96]):
    st = int(SR*0.06*i); seg = x[:len(x)-st]
    s[st:] += np.sin(2*np.pi*note(n)*seg)*env(len(seg), 0.002, 0.18) + 0.3*np.sin(2*np.pi*note(n+12)*seg)*env(len(seg), 0.002, 0.08)
s += 0.08*rng.standard_normal(len(x))*env(len(x), 0.001, 0.05)
save('cash', s, 0.6)

# horn: a deep ship's horn with a soft swell
x = t(1.6); f = 98
s = sum((1/k)*np.sin(2*np.pi*f*k*x + 0.3*k) for k in range(1, 9))
s *= 1 + 0.04*np.sin(2*np.pi*5*x)
s = lp(s, 0.12) * adsr(len(x), 0.18, 0.5)
save('horn', s, 0.55)

# clank: the crane's spreader locking on, metal on metal
x = t(0.5)
s = sum(a*np.sin(2*np.pi*fr*x)*env(len(x), 0.001, d) for fr, a, d in [(420, 1, 0.12), (1130, 0.6, 0.07), (2370, 0.35, 0.04), (3190, 0.2, 0.03)])
s += 0.5*lp(rng.standard_normal(len(x)), 0.3)*env(len(x), 0.001, 0.015)
save('clank', s, 0.45)

# chime: research done, a bell triad
x = t(1.4); s = np.zeros_like(x)
for i, n in enumerate([79, 83, 86, 91]):
    st = int(SR*0.09*i); seg = x[:len(x)-st]
    s[st:] += (np.sin(2*np.pi*note(n)*seg) + 0.4*np.sin(2*np.pi*note(n)*2.76*seg)*env(len(seg), 0.001, 0.15)) * env(len(seg), 0.003, 0.45)
save('chime', s, 0.55)

# fanfare: selling the company / founding an Empire
x = t(2.2); s = np.zeros_like(x)
def brass(f, seg):
    v = sum((0.9**k)*np.sin(2*np.pi*f*k*seg) for k in range(1, 7))
    return lp(v, 0.25)
for st, n, d in [(0, 72, 0.18), (0.18, 76, 0.18), (0.36, 79, 0.18), (0.54, 84, 1.5)]:
    i0 = int(SR*st); seg = x[:int(SR*d)]
    if i0+len(seg) > len(x): seg = seg[:len(x)-i0]
    s[i0:i0+len(seg)] += brass(note(n), seg)*adsr(len(seg), 0.02, 0.12 if d < 1 else 0.8)
for n in [60, 64, 67]:
    seg = x[int(SR*0.54):]; s[int(SR*0.54):] += 0.25*brass(note(n), seg)*adsr(len(seg), 0.05, 0.9)
save('fanfare', s, 0.6)

# music: a gentle harbour loop. 92 bpm, C - Am - F - G, two bars each, 16 bars.
bpm = 92; beat = 60/bpm; bar = 4*beat
prog = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [55, 59, 62])]
bars = 16; L = int(SR*bar*bars); mus = np.zeros(L + SR*4)
def add(at, sig):
    i0 = int(SR*at); mus[i0:i0+len(sig)] += sig
def pluck(f, dur, amp=1.0):
    x = t(dur)
    v = np.sin(2*np.pi*f*x) + 0.35*np.sin(2*np.pi*2*f*x)*env(len(x), 0.001, 0.12) + 0.12*np.sin(2*np.pi*3*f*x)*env(len(x), 0.001, 0.06)
    return amp*v*env(len(x), 0.004, dur*0.35)
def pad(fs, dur, amp):
    x = t(dur)
    v = sum(np.sin(2*np.pi*f*x) + np.sin(2*np.pi*f*1.003*x) + 0.3*np.sin(2*np.pi*2*f*x) for f in fs)
    return amp*v*adsr(len(x), 0.8, 1.2)
melody = [  # (beat in the 8-bar phrase, midi, beats)
    (0, 76, 1.5), (1.5, 74, 0.5), (2, 72, 1), (3, 74, 1), (4, 76, 2), (6, 79, 2),
    (8, 76, 1.5), (9.5, 74, 0.5), (10, 72, 2), (12, 69, 2), (14, 72, 2),
    (16, 77, 1.5), (17.5, 76, 0.5), (18, 74, 1), (19, 72, 1), (20, 69, 2), (22, 72, 2),
    (24, 74, 1.5), (25.5, 72, 0.5), (26, 71, 1), (27, 74, 1), (28, 79, 3),
]
for b in range(bars):
    root, chord = prog[(b // 2) % 4]
    at = b*bar
    if b % 2 == 0: add(at, pad([note(n) for n in chord], bar*2 + 0.6, 0.05))
    add(at, pluck(note(root - 12 + 12), beat*1.8, 0.35)); add(at + 2*beat, pluck(note(root + 7 - 12 + 12), beat*1.8, 0.25))
    for k, n in enumerate([chord[0], chord[1], chord[2], chord[1]] * 2):
        add(at + k*beat/2, pluck(note(n + 12), beat*1.2, 0.07 + 0.03*(k % 2 == 0)))
for rep in range(bars // 8):
    if rep == 0: continue  # melody only on the second half, so the loop breathes
    for st, n, d in melody:
        add(rep*8*bar + st*beat, pluck(note(n), d*beat + 0.6, 0.22))
# gentle surf: low-passed noise swelling every couple of bars
surf = lp(rng.standard_normal(L), 0.02)
surf *= 0.5 + 0.5*np.sin(2*np.pi*np.arange(L)/(SR*bar*2))**2
mus[:L] += 0.25*surf / (np.max(np.abs(surf)) + 1e-9)
# wrap the tail onto the start so it loops seamlessly
tail = mus[L:]; mus = mus[:L].copy(); mus[:len(tail)] += tail
save('music', mus, 0.5, bitrate='64k')
