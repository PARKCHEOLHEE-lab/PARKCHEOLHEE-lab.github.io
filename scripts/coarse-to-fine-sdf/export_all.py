"""Build the data for the three figures of the coarse-to-fine-sdf post.

Shape: the Stanford bunny, in the closed (watertight) form used by the libigl tutorials,
so the signed distance is well defined. trimesh gives the true distance to the closest
triangle, negative inside. Everything the figures draw -- values, marked cells, triangles
-- comes from that field; nothing is drawn by hand.

Distance fields are cached under ~/.cache/coarse-to-fine-sdf, because the fine grids take
minutes. Delete the cache to force a recompute.

    python3 export_all.py            # writes sdf.json, mc.json, ladder.json next to this file
    python3 export_all.py 3          # only figure 3

Only figure 1 has to touch the mesh itself, so trimesh is imported on demand. With the fields
already cached, figures 2 and 3 rebuild without it.
"""

import json
import pathlib
import sys

import numpy as np
from skimage import measure

HERE = pathlib.Path(__file__).parent
CACHE = pathlib.Path.home() / ".cache" / "coarse-to-fine-sdf"
CACHE.mkdir(parents=True, exist_ok=True)

EXTENT = 1.0
CORNERS = [(i, j, k) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
EDGES = [(a, b) for a in range(8) for b in range(a + 1, 8) if bin(a ^ b).count("1") == 1]
VIEW = np.array([4.3, 2.5, 3.1])
VIEW = VIEW / np.linalg.norm(VIEW)
FIGURES = set(sys.argv[1:]) or {"1", "2", "3"}

_BUNNY = {}


def bunny():
    """the watertight bunny, loaded the first time a distance is actually needed"""
    if not _BUNNY:
        import trimesh
        m = trimesh.load(CACHE / "bunny.off", process=True)
        m.apply_translation(-m.bounds.mean(axis=0))
        m.apply_scale(1.45 / m.extents.max())
        m.apply_transform(trimesh.transformations.rotation_matrix(np.radians(-15), [0, 1, 0]))
        _BUNNY["mesh"] = m
        _BUNNY["query"] = trimesh.proximity.ProximityQuery(m)
        print("bunny:", len(m.faces), "faces, watertight:", m.is_watertight)
    return _BUNNY["mesh"]


def sdf(pts):
    pts = np.asarray(pts, dtype=float).reshape(-1, 3)
    bunny()
    return -_BUNNY["query"].signed_distance(pts)  # trimesh is + inside; we want + outside


def closest_on_surface(p):
    """the point of the surface nearest p"""
    import trimesh
    q, _, _ = trimesh.proximity.closest_point(bunny(), [p])
    return q[0]


def grid_field(n):
    """Distances on an (n+1)^3 grid, cached on disk."""
    a = np.linspace(-EXTENT, EXTENT, n + 1)
    f = CACHE / f"field_{n}.npy"
    if f.exists():
        return a, np.load(f)
    xx, yy, zz = np.meshgrid(a, a, a, indexing="ij")
    print(f"   computing {n + 1}^3 = {(n + 1) ** 3:,} distances ...", flush=True)
    field = sdf(np.stack([xx, yy, zz], axis=-1).reshape(-1, 3)).reshape((n + 1,) * 3)
    np.save(f, field)
    return a, field


def mesh_json(verts, faces):
    return {"vertices": [round(float(x), 5) for x in np.asarray(verts).reshape(-1)],
            "faces": [int(x) for x in np.asarray(faces).reshape(-1)]}


def cell_values(f, i, j, k):
    return np.array([f[i + di, j + dj, k + dk] for di, dj, dk in CORNERS])


def corner_stack(f, n):
    """the eight corner values of every cell of an n^3 grid, as (8, n, n, n)"""
    return np.stack([f[i:i + n, j:j + n, k:k + n] for i, j, k in CORNERS])


def crossing_mask(f, n):
    c = corner_stack(f, n)
    return (c.min(0) <= 0) & (c.max(0) >= 0)


def centres(mask, a):
    mid = (a[:-1] + a[1:]) / 2
    i, j, k = np.nonzero(mask)
    return np.stack([mid[i], mid[j], mid[k]], axis=1)


# ------------------------------------------------------------------ figure 1: the SDF
if "1" in FIGURES:
    print("figure 1 ...")
    probes = []
    for p in (np.array([0.62, 0.34, -0.80]), np.array([0.02, -0.10, 0.05])):
        q = closest_on_surface(p)
        d = float(sdf([p])[0])
        probes.append({"p": [round(float(x), 4) for x in p],
                       "q": [round(float(x), 4) for x in q], "v": round(d, 3)})
        print(f"   probe {np.round(p, 2)} -> {d:+.3f}")

    PLANE_N, SPAN, GRID_N = 21, 0.95, 15
    a = np.linspace(-SPAN, SPAN, PLANE_N)
    xx, yy = np.meshgrid(a, a, indexing="ij")
    plane_pts = np.stack([xx, yy, np.zeros_like(xx)], axis=-1).reshape(-1, 3)
    b = np.linspace(-0.93, 0.93, GRID_N)
    gx, gy, gz = np.meshgrid(b, b, b, indexing="ij")
    grid_pts = np.stack([gx, gy, gz], axis=-1).reshape(-1, 3)

    json.dump({"probes": probes,
               "plane": {"points": [round(float(x), 4) for x in plane_pts.reshape(-1)],
                         "values": [round(float(v), 4) for v in sdf(plane_pts)]},
               "grid": {"points": [round(float(x), 4) for x in grid_pts.reshape(-1)],
                        "values": [round(float(v), 4) for v in sdf(grid_pts)]},
               "mesh": mesh_json(bunny().vertices, bunny().faces)},
              open(HERE / "sdf.json", "w"))


# ------------------------------------------------------- figure 2: marching cubes
N_CELL, N_WHOLE = 16, 32
H = 2 * EXTENT / N_CELL


def cut_quality(vals):
    best = 1.0
    for x, y in EDGES:
        if (vals[x] < 0) == (vals[y] < 0):
            continue
        t = vals[x] / (vals[x] - vals[y])
        best = min(best, min(t, 1 - t))
    return best


def faces_camera(vals):
    v, f, _, _ = measure.marching_cubes(vals.reshape(2, 2, 2), level=0.0, spacing=(H, H, H))
    n = np.zeros(3)
    for tri in f:
        n += np.cross(v[tri[1]] - v[tri[0]], v[tri[2]] - v[tri[0]])
    norm = np.linalg.norm(n)
    return 0.0 if norm == 0 else abs(float(np.dot(n / norm, VIEW)))


def find_cell(count):
    best = None
    for i in range(N_CELL):
        for j in range(N_CELL):
            for k in range(N_CELL):
                vals = cell_values(field_c, i, j, k)
                if (vals < 0).sum() != count:
                    continue
                score = cut_quality(vals) + 0.5 * faces_camera(vals)
                if best is None or score > best[0]:
                    best = (score, vals)
    return best[1]


def pack_cell(vals):
    v, f, _, _ = measure.marching_cubes(vals.reshape(2, 2, 2), level=0.0, spacing=(H, H, H))
    return {"corners": [{"p": [round((c[ax] - 0.5) * H, 5) for ax in range(3)],
                         "v": round(float(val), 3)} for c, val in zip(CORNERS, vals)],
            "size": H, **mesh_json(v - H / 2, f), "triangles": int(len(f))}


if "2" in FIGURES:
    print("figure 2 ...")
    a_c, field_c = grid_field(N_CELL)
    cases = {"one": pack_cell(find_cell(1)), "two": pack_cell(find_cell(2))}

    best = None                                 # a crossing edge with a lopsided split
    for i in range(N_CELL):
        for j in range(N_CELL):
            for k in range(N_CELL):
                vv = cell_values(field_c, i, j, k)
                for x, y in EDGES:
                    if (vv[x] < 0) == (vv[y] < 0):
                        continue
                    hi, lo = (x, y) if vv[x] > 0 else (y, x)
                    p_, q_ = round(float(vv[hi]), 2), round(float(vv[lo]), 2)
                    if p_ <= 0 or q_ >= 0:
                        continue
                    t = p_ / (p_ - q_)
                    if best is None or abs(t - 0.75) < best[0]:
                        best = (abs(t - 0.75), p_, q_, t)
    _, v0, v1, t = best
    cases["edge"] = {"v0": v0, "v1": v1, "t": round(t, 3)}
    print(f"   edge {v0:+.2f} -> {v1:+.2f}  t = {t:.2f}")

    a_w, field_w = grid_field(N_WHOLE)
    verts, faces, _, _ = measure.marching_cubes(field_w, level=0.0)
    verts = verts / N_WHOLE * 2.0 - EXTENT
    cross = crossing_mask(field_w, N_WHOLE)
    json.dump({"cases": cases,
               "whole": {**mesh_json(verts, faces),
                         "cells": [round(float(x), 5) for x in centres(cross, a_w).reshape(-1)],
                         "size": 2 * EXTENT / N_WHOLE, "cellCount": int(cross.sum()),
                         "triangles": int(len(faces)), "n": N_WHOLE}},
              open(HERE / "mc.json", "w"))
    print(f"   {N_WHOLE}^3: {int(cross.sum())} cells cross the surface, {len(faces)} triangles")


# ------------------------------------------------------------- figure 3: the ladder
# A cell is kept when the surface crosses it OR when it lies within BAND cells of the surface.
# The band is what saves thin parts: an ear is thinner than a coarse cell, so all eight corners
# can be outside and the sign test alone drops it -- and a dropped cell never comes back.
# sqrt(3)/2 is half a cell's space diagonal, so it is the farthest any point inside a cell can
# sit from its nearest corner. That makes it the smallest band that cannot drop a cell the
# surface passes through, and anything wider only pulls in cells the surface misses:
# latent-shapes uses 2.5 cells plus a one-cell grow, which at a 4^3 start marks every cell.
LADDER = [4, 8, 16, 32, 64]
BAND = np.sqrt(3) / 2


def refine(mask):
    """the same mask on the next grid down, each cell split in eight"""
    return np.repeat(np.repeat(np.repeat(mask, 2, 0), 2, 1), 2, 2)


def live_corners(alive, n):
    """the grid points touched by at least one live cell -- these are what get evaluated"""
    keep = np.zeros((n + 1,) * 3, dtype=bool)
    for di, dj, dk in CORNERS:
        keep[di:di + n, dj:dj + n, dk:dk + n] |= alive
    return keep


if "3" in FIGURES:
    print("figure 3 ...")
    masks, crossings, axes, fields, parent, sampled = [], [], [], [], None, 0
    for n in LADDER:
        a_lv, f_lv = grid_field(n)
        cross = crossing_mask(f_lv, n)
        near = np.abs(corner_stack(f_lv, n)).min(0) < BAND * (2 * EXTENT / n)
        mark = cross | near
        if parent is not None:
            mark &= parent                      # a cell only lives where its parent lived
        alive = np.ones((n,) * 3, dtype=bool) if parent is None else parent
        sampled += int(live_corners(alive, n).sum())
        masks.append(mark)
        crossings.append(cross & mark)
        axes.append(a_lv)
        fields.append(f_lv)
        parent = refine(mark)
        print(f"   n={n:3d}: {int(mark.sum()):6d} kept "
              f"({int((cross & mark).sum()):5d} crossing + {int((mark & ~cross).sum()):5d} near)"
              f", {int(live_corners(alive, n).sum()):7d} points sampled")

    # the field the run really holds: evaluated where a cell was live, copied from the level
    # above everywhere else -- the same nearest-sample inherit reconstruct_stream.py does
    own = fields[0]
    for step in range(1, len(LADDER)):
        n = LADDER[step]
        up = np.round(np.arange(n + 1) / 2).astype(int)
        own = np.where(live_corners(refine(masks[step - 1]), n), fields[step],
                       own[np.ix_(up, up, up)])

    FINE = LADDER[-1]
    v_own, f_own, _, _ = measure.marching_cubes(own, level=0.0)
    v_true, f_true, _, _ = measure.marching_cubes(fields[-1], level=0.0)
    idx = np.clip(np.floor(v_true).astype(int), 0, FINE - 1)
    gap = 100 * float((~masks[-1][idx[:, 0], idx[:, 1], idx[:, 2]]).mean())

    a0 = axes[0]
    pts0 = np.stack(np.meshgrid(a0, a0, a0, indexing="ij"), axis=-1).reshape(-1, 3)
    dense = (FINE + 1) ** 3
    json.dump({"ladder": LADDER, "band": BAND,
               "levels": [{"n": int(n), "size": float(2 * EXTENT / n),
                           "crossing": [round(float(x), 5) for x in centres(c, a).reshape(-1)],
                           "near": [round(float(x), 5) for x in centres(m & ~c, a).reshape(-1)],
                           "counts": {"kept": int(m.sum()), "crossing": int(c.sum()),
                                      "near": int((m & ~c).sum()), "cells": int(n ** 3)}}
                          for n, m, c, a in zip(LADDER, masks, crossings, axes)],
               "points": [round(float(x), 4) for x in pts0.reshape(-1)],
               "inside": [bool(x) for x in (fields[0].reshape(-1) < 0)],
               "own": mesh_json(v_own / FINE * 2.0 - EXTENT, f_own),
               "true": mesh_json(v_true / FINE * 2.0 - EXTENT, f_true),
               "stats": {"sampled": sampled, "dense": dense,
                         "save": round(dense / sampled, 1), "gap": round(gap, 1),
                         "triangles": int(len(f_own)), "trueTriangles": int(len(f_true))}},
              open(HERE / "ladder.json", "w"))
    print(f"   total sampled {sampled:,} vs dense {dense:,} ({dense / sampled:.1f}x fewer), "
          f"surface left uncovered {gap:.1f}%, mesh {len(f_own):,} triangles "
          f"(dense {len(f_true):,})")
