import numpy as np


def unit(seed: int) -> np.ndarray:
    v = np.random.default_rng(seed).standard_normal(512).astype(np.float32)
    return v / np.linalg.norm(v)


def near(base: np.ndarray, sim: float, seed: int) -> np.ndarray:
    noise = unit(seed)
    orth = noise - float(noise @ base) * base
    orth /= np.linalg.norm(orth)
    v = sim * base + np.sqrt(1 - sim * sim) * orth
    return (v / np.linalg.norm(v)).astype(np.float32)
