# Three.js r187

Vendored from https://github.com/mrdoob/three.js/tree/r187 for optional, offline-capable 3D rendering.

- `three.module.js` and `three.core.js`: upstream build files, unchanged.
- `OrbitControls.js`: upstream addon; its sole `from 'three'` import is changed to `from './three.module.js'` for buildless browser use.
- `LICENSE`: upstream MIT license.

The insole geometry, animation, data display and application logic in `scripts/` are original to this project. The 3D motion is an illustrative demonstration; it is not inferred from pressure samples or an IMU stream.
