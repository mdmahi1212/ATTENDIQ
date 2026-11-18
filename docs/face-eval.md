# Face recognition evaluation

> **Status: NOT YET RUN ON REAL PHOTOS.** The section below is only a *pipeline smoke test*: the 6 faces of InsightFace's
> bundled sample photo, each saved 3 times (original, mirrored, brighter). Those "genuine" pairs are near-copies of one
> image, so the genuine scores are far higher than real ones and the FRR column means nothing. The impostor scores
> (different real people) are meaningful but come from only 6 people.
>
> To produce the real report: put 2+ people × 5+ photos each (different days/light/angles; phone selfies are ideal)
> into `eval/<person>/`, then run
> `apps\face-api\.venv\Scripts\python.exe scripts\face-eval.py eval --out docs\face-eval.md`.

## Smoke test (synthetic genuine pairs)

Generated 2026-11-18 06:54 UTC by `scripts/face-eval.py` on `evalsmoke/`.
Model: InsightFace buffalo_l (SCRFD det_10g + ArcFace w600k_r50), same quality gates as apps/face-api.

- People: 6; usable photos: 18; rejected photos: 0
- Genuine pairs: n=18 min=0.894 p1=0.896 p5=0.904 median=0.945 p95=0.971 p99=0.973 max=0.973 mean=0.940
- Impostor pairs: n=135 min=-0.123 p1=-0.106 p5=-0.067 median=0.035 p95=0.189 p99=0.231 max=0.247 mean=0.036

### Threshold table

Accept when similarity >= threshold. FAR = impostor pairs accepted; FRR = genuine pairs rejected.

| threshold | FAR | FRR |
|---:|---:|---:|
| 0.25 | 0.00% | 0.00% |
| 0.30 | 0.00% | 0.00% |
| 0.35 | 0.00% | 0.00% |
| 0.40 | 0.00% | 0.00% |
| 0.45 | 0.00% | 0.00% |
| 0.50 | 0.00% | 0.00% |
| 0.55 | 0.00% | 0.00% |
| 0.60 | 0.00% | 0.00% |
| 0.65 | 0.00% | 0.00% |
| 0.70 | 0.00% | 0.00% |

### Suggested thresholds

- Highest impostor score seen: 0.247. Lowest threshold with zero false accepts here: 0.25
- Approximate equal-error threshold: 0.25
- Project defaults: gate match >= 0.45 (with track voting), duplicate-enrollment flag > 0.60, self-verify >= 0.45. Small datasets make these numbers rough: re-run with more people.

### Distributions

Genuine:
```
-0.2..-0.1 |  0
-0.1..-0.0 |  0
-0.0..+0.1 |  0
+0.1..+0.2 |  0
+0.2..+0.3 |  0
+0.3..+0.4 |  0
+0.4..+0.5 |  0
+0.5..+0.6 |  0
+0.6..+0.7 |  0
+0.7..+0.8 |  0
+0.8..+0.9 | ## 1
+0.9..+1.0 | ######################################## 17
```
Impostor:
```
-0.2..-0.1 | ## 3
-0.1..-0.0 | ########################## 44
-0.0..+0.1 | ######################################## 68
+0.1..+0.2 | ######### 15
+0.2..+0.3 | ### 5
+0.3..+0.4 |  0
+0.4..+0.5 |  0
+0.5..+0.6 |  0
+0.6..+0.7 |  0
+0.7..+0.8 |  0
+0.8..+0.9 |  0
+0.9..+1.0 |  0
```
