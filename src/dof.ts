// ---------------------------------------------------------------------------
// Depth-of-field post pass for the virtual camera monitor. Given the scene
// color + depth rendered from the lens camera, it blurs each pixel by a
// circle-of-confusion computed from the real optics (focal length, T-stop,
// sensor gate width, focus distance) — the same thin-lens formula as
// lens.ts cocDiameterMm, evaluated per pixel in GLSL.
//
// This is a single extra full-screen pass, gated behind a toggle (off by
// default) so it never threatens the 72 fps budget unless explicitly enabled.
// The blur is a bounded two-ring disc — an approximate bokeh sufficient to
// read focus falloff, not a physically exact renderer (that's the Unreal
// path). Pixels at/near focus (CoC < 1 px) pass through untouched, so DOF-on
// with everything in focus matches DOF-off exactly.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

export interface DofParams {
  /** Focus distance (meters) — typically the nearest actor. */
  focusDistM: number;
  focalMm: number;
  fNumber: number;
  /** Sensor gate width (mm) for the active format. */
  gateWidthMm: number;
  /** rtCamera near/far, to linearize the depth texture. */
  near: number;
  far: number;
  /** Hard cap on blur radius (pixels) so cost stays bounded. */
  maxCoCPx: number;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  #include <packing>
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focusDist;
  uniform float focalMm;
  uniform float fNumber;
  uniform float gateWidthMm;
  uniform vec2 texel;
  uniform float maxCoCPx;

  float subjectDist(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    float viewZ = perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    return -viewZ; // meters in front of the lens
  }

  // Blur radius in pixels from the thin-lens circle of confusion (mm on the
  // sensor) mapped through the gate width to the image width. Mirrors
  // lens.ts cocDiameterMm.
  float cocPx(float S2) {
    float F = focalMm / 1000.0; // focal length in meters
    if (S2 <= 0.0 || focusDist <= F) return 0.0;
    float cMeters = (F * F * abs(S2 - focusDist)) / (fNumber * S2 * (focusDist - F));
    float cMm = cMeters * 1000.0;
    float px = (cMm / gateWidthMm) / texel.x; // fraction of width * width(px)
    return clamp(px, 0.0, maxCoCPx);
  }

  void main() {
    vec3 base = texture2D(tColor, vUv).rgb;
    float r = cocPx(subjectDist(vUv));
    if (r < 1.0) {
      gl_FragColor = vec4(base, 1.0);
      return;
    }
    vec3 sum = base;
    float total = 1.0;
    // Two concentric rings, 8 taps each — cheap approximate disc bokeh.
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.78539816; // 45 degrees
      vec2 dir = vec2(cos(a), sin(a));
      for (int k = 1; k <= 2; k++) {
        vec2 off = dir * (r * (float(k) / 2.0)) * texel;
        sum += texture2D(tColor, vUv + off).rgb;
        total += 1.0;
      }
    }
    gl_FragColor = vec4(sum / total, 1.0);
  }
`;

export class DofPass {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        cameraNear: { value: 0.05 },
        cameraFar: { value: 100 },
        focusDist: { value: 3 },
        focalMm: { value: 35 },
        fNumber: { value: 2.8 },
        gateWidthMm: { value: 24.89 },
        texel: { value: new THREE.Vector2(1 / 1024, 1 / 430) },
        maxCoCPx: { value: 18 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
  }

  /** Blurs `colorTex`/`depthTex` into `out`. xr state is saved/restored. */
  render(
    renderer: THREE.WebGLRenderer,
    colorTex: THREE.Texture,
    depthTex: THREE.Texture,
    out: THREE.WebGLRenderTarget,
    p: DofParams,
  ): void {
    const u = this.material.uniforms;
    u.tColor.value = colorTex;
    u.tDepth.value = depthTex;
    u.cameraNear.value = p.near;
    u.cameraFar.value = p.far;
    u.focusDist.value = p.focusDistM;
    u.focalMm.value = p.focalMm;
    u.fNumber.value = p.fNumber;
    u.gateWidthMm.value = p.gateWidthMm;
    u.maxCoCPx.value = p.maxCoCPx;
    (u.texel.value as THREE.Vector2).set(1 / out.width, 1 / out.height);

    const prevXr = renderer.xr.enabled;
    const prevTarget = renderer.getRenderTarget();
    // try/finally so a throw here (context loss, shader error) can never leave
    // xr.enabled=false — that would black/freeze the headset for the rest of
    // the session (mirrors cameraView.renderPass).
    try {
      renderer.xr.enabled = false;
      renderer.setRenderTarget(out);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.xr.enabled = prevXr;
    }
  }

  dispose(): void {
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
