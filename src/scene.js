/* ============================================================
   Villa Savoye — Le Corbusier (1928-1931) · Poissy
   Refined cartoon 3D scene.  Part 1 : core / sky / light / mood
   ============================================================ */
(function () {
  'use strict';
  var T = THREE;

  /* ---------- palette ---------- */
  var C = {
    ink:        0x39404f,
    white:      0xf7f4ed,
    whiteSoft:  0xeae4d7,
    concrete:   0xd9d2c5,
    concrete2:  0xc4bcae,
    frame:      0x474f61,
    metal:      0x8b93a3,
    glass:      0xc4e3f0,
    grass:      0x8ec179,
    grassDeep:  0x6ea45c,
    earth:      0xa98a63,
    gravel:     0xe6dcc8,
    trunk:      0x8d6d4e,
    leaf1:      0x74b062,
    leaf2:      0x96c97e,
    leaf3:      0x5b9c57,
    terra:      0xd2714d,
    ochre:      0xe3ac48,
    cerulean:   0x4f8ec4,
    teal:       0x47a096,
    cream:      0xf3e5c6,
    blush:      0xe79a9a,
    carRed:     0xd05340,
    carBlue:    0x4a7fb5,
    skin:       0xf0c8a4,
    hair:       0x3b3038,
    dark:       0x2b3140
  };

  /* ---------- state ---------- */
  var VS = window.VS = {};
  VS.C = C;
  VS.T = T;

  var renderer, scene, camera, clock;
  var outlineMats = [], glassMats = [], emissiveMats = [], moodTargets = [];
  var gradientMap;

  /* ============================================================
     RENDERER / SCENE
     ============================================================ */
  VS.initCore = function (canvas) {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.NoToneMapping;
    VS.STILL = /[?&]still=1/.test(window.location.search);
    if (VS.STILL) renderer.setPixelRatio(1);
    VS.renderer = renderer;

    scene = new T.Scene();
    VS.scene = scene;

    camera = new T.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.5, 900);
    VS.camera = camera;

    clock = new T.Clock();
    VS.clock = clock;

    gradientMap = makeGradientMap();
    VS.gradientMap = gradientMap;

    buildSky();
    buildLights();
    return { renderer: renderer, scene: scene, camera: camera };
  };

  function makeGradientMap() {
    var data = new Uint8Array([96, 146, 196, 230, 255]);
    var tex = new T.DataTexture(data, data.length, 1, T.RedFormat);
    tex.minFilter = T.NearestFilter;
    tex.magFilter = T.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  /* ============================================================
     MATERIAL HELPERS
     ============================================================ */
  VS.toon = function (color, o) {
    o = o || {};
    var m = new T.MeshToonMaterial({ color: new T.Color(color), gradientMap: gradientMap });
    if (o.emissive) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity || 0.6; }
    if (o.opacity !== undefined) { m.transparent = true; m.opacity = o.opacity; }
    if (o.side !== undefined) m.side = o.side;
    return m;
  };

  var OUTLINE_VS = [
    'uniform float uThick;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vec3 n = normalize(normalMatrix * normal);',
    '  mv.xyz += n * uThick * max(0.0, -mv.z);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var OUTLINE_FS = [
    'uniform vec3 uColor;',
    'void main() { gl_FragColor = vec4(uColor, 1.0); }'
  ].join('\n');

  var outlineColor = new T.Color(C.ink);
  var glassBase = new T.Color(C.glass);
  var warmGlass = new T.Color(0xffd39a);
  VS.setOutlineColor = function (hex) { outlineColor.set(hex); for (var i = 0; i < outlineMats.length; i++) outlineMats[i].uniforms.uColor.value.copy(outlineColor); };

  function outlineMat(thick) {
    var m = new T.ShaderMaterial({
      uniforms: { uThick: { value: thick }, uColor: { value: outlineColor.clone() } },
      vertexShader: OUTLINE_VS,
      fragmentShader: OUTLINE_FS,
      side: T.BackSide
    });
    return m;
  }

  /* generic solid with an inverted-hull ink outline */
  VS.solid = function (parent, geo, color, o) {
    o = o || {};
    var mat = o.material || VS.toon(color, o);
    var mesh = new T.Mesh(geo, mat);
    mesh.castShadow = o.cast !== false;
    mesh.receiveShadow = o.receive !== false;
    if (o.outline !== false) {
      var ol = new T.Mesh(geo, outlineMat(o.thickness || 0.0016));
      ol.castShadow = false; ol.receiveShadow = false;
      mesh.add(ol);
      outlineMats.push(ol.material);
    }
    parent.add(mesh);
    return mesh;
  };

  /* box placed by its bottom face  (w,h,d in metres; cx,by,cz) */
  VS.bx = function (parent, w, h, d, cx, by, cz, color, o) {
    o = o || {};
    var m = VS.solid(parent, new T.BoxGeometry(w, h, d), color, o);
    m.position.set(cx, by + h / 2, cz);
    if (o.ry) m.rotation.y = o.ry;
    if (o.rz) m.rotation.z = o.rz;
    if (o.rx) m.rotation.x = o.rx;
    return m;
  };

  VS.cyl = function (parent, rt, rb, h, cx, by, cz, color, o) {
    o = o || {};
    var seg = o.seg || 32;
    var m = VS.solid(parent, new T.CylinderGeometry(rt, rb, h, seg, 1, !!o.open, o.thetaStart, o.thetaLen), color, o);
    m.position.set(cx, by + h / 2, cz);
    if (o.ry) m.rotation.y = o.ry;
    return m;
  };

  VS.sph = function (parent, r, cx, cy, cz, color, o) {
    o = o || {};
    var det = o.detail === undefined ? 1 : o.detail;
    var m = VS.solid(parent, new T.IcosahedronGeometry(r, det), color, o);
    m.position.set(cx, cy, cz);
    if (o.sy) m.scale.y = o.sy;
    return m;
  };

  /* glass pane helper — kept out of the outline pass */
  VS.glassMat = function (color, opacity) {
    var m = new T.MeshToonMaterial({
      color: new T.Color(color),
      gradientMap: gradientMap,
      transparent: true,
      opacity: opacity === undefined ? 0.52 : opacity,
      depthWrite: false,
      side: T.DoubleSide
    });
    glassMats.push(m);
    return m;
  };

  /* ============================================================
     SKY DOME
     ============================================================ */
  var skyMat, stars, clouds = [];
  function buildSky() {
    var g = new T.SphereGeometry(420, 40, 24);
    skyMat = new T.ShaderMaterial({
      uniforms: {
        uTop:    { value: new T.Color(0x4f9ad8) },
        uMid:    { value: new T.Color(0xa8d2ee) },
        uBottom: { value: new T.Color(0xf0e6d2) },
        uSunDir: { value: new T.Vector3(0.4, 0.5, 0.4) },
        uSunCol: { value: new T.Color(0xffd9a0) },
        uGlow:   { value: 0.5 }
      },
      vertexShader: [
        'varying vec3 vPos;',
        'void main() {',
        '  vPos = normalize(position);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uTop, uMid, uBottom, uSunCol, uSunDir;',
        'uniform float uGlow;',
        'varying vec3 vPos;',
        'void main() {',
        '  float h = vPos.y;',
        '  vec3 col = mix(uBottom, uMid, smoothstep(-0.06, 0.30, h));',
        '  col = mix(col, uTop, smoothstep(0.22, 0.85, h));',
        '  float d = distance(vPos, normalize(uSunDir));',
        '  col += uSunCol * uGlow * pow(max(0.0, 1.0 - d * 0.5), 18.0);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      side: T.BackSide,
      depthWrite: false,
      fog: false
    });
    var sky = new T.Mesh(g, skyMat);
    sky.frustumCulled = false;
    scene.add(sky);

    /* stars (night only) */
    var N = 700, pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var u = Math.random() * Math.PI * 2;
      var v = Math.random() * 0.9 + 0.06;
      var r = 340;
      var y = Math.sin(v * Math.PI / 2);
      var rad = Math.cos(v * Math.PI / 2);
      pos[i * 3] = Math.cos(u) * rad * r;
      pos[i * 3 + 1] = y * r;
      pos[i * 3 + 2] = Math.sin(u) * rad * r;
    }
    var sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.BufferAttribute(pos, 3));
    var sm = new T.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    stars = new T.Points(sg, sm);
    stars.frustumCulled = false;
    scene.add(stars);

    /* clouds */
    var cloudMat = new T.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap });
    for (var c = 0; c < 8; c++) {
      var grp = new T.Group();
      var blobs = 3 + Math.floor(Math.random() * 3);
      for (var b = 0; b < blobs; b++) {
        var r = 2.6 + Math.random() * 2.6;
        var s = new T.Mesh(new T.IcosahedronGeometry(r, 1), cloudMat);
        s.position.set((b - blobs / 2) * 3.4 + Math.random() * 1.5, Math.random() * 1.1, Math.random() * 2.4 - 1.2);
        s.scale.set(1, 0.62, 0.9);
        grp.add(s);
      }
      var ang = Math.random() * Math.PI * 2;
      var rad2 = 95 + Math.random() * 105;
      grp.position.set(Math.cos(ang) * rad2, 34 + Math.random() * 26, Math.sin(ang) * rad2);
      grp.userData.speed = 0.25 + Math.random() * 0.35;
      if (c > 3) grp.scale.setScalar(0.65);
      scene.add(grp);
      clouds.push(grp);
    }
    VS.cloudMat = cloudMat;
  }

  /* ============================================================
     LIGHTS
     ============================================================ */
  var sun, fill, hemi;
  function buildLights() {
    sun = new T.DirectionalLight(0xffe9c6, 2.2);
    sun.position.set(-52, 34, 48);
    sun.castShadow = true;
    var sms = VS.STILL ? 1024 : 2048;
    sun.shadow.mapSize.set(sms, sms);
    var cam = sun.shadow.camera;
    cam.left = -46; cam.right = 46; cam.top = 46; cam.bottom = -46;
    cam.near = 1; cam.far = 260;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);

    fill = new T.DirectionalLight(0xc9defa, 0.42);
    fill.position.set(40, 26, -36);
    scene.add(fill);

    hemi = new T.HemisphereLight(0xcfe6ff, 0xd8c8a6, 0.55);
    scene.add(hemi);
    var amb = new T.AmbientLight(0xc6d6e6, 0.20);
    scene.add(amb);
    VS.sun = sun; VS.fill = fill; VS.hemi = hemi;
  }

  /* ============================================================
     MOODS  (day cycle)
     ============================================================ */
  VS.MOODS = {
    dawn: {
      label: '清晨',
      sun:  { color: 0xffeccb, intensity: 2.15, pos: [-58, 26, 52] },
      fill: { color: 0xc6ddff, intensity: 0.40 },
      hemi: { sky: 0xd2e6ff, ground: 0xdccbaa, intensity: 0.68 },
      sky:  { top: 0x5aa3da, mid: 0xaad5f0, bottom: 0xf3e7d0, glow: 0.55, sunCol: 0xffdcae },
      fog:  { color: 0xd8e7f2, near: 78, far: 320 },
      outline: 0x39404f,
      stars: 0,
      interior: 0,
      exposure: 1.0,
      ground: 0x8ec179, cloud: 0xf2f6fc
    },
    noon: {
      label: '正午',
      sun:  { color: 0xfff6e0, intensity: 2.5, pos: [34, 62, 30] },
      fill: { color: 0xcfe3ff, intensity: 0.36 },
      hemi: { sky: 0xd8ecff, ground: 0xe0d2b2, intensity: 0.70 },
      sky:  { top: 0x3486cc, mid: 0x9cc9ec, bottom: 0xe4eef4, glow: 0.28, sunCol: 0xfff0d0 },
      fog:  { color: 0xe0ecf4, near: 85, far: 340 },
      outline: 0x39404f,
      stars: 0,
      interior: 0,
      exposure: 0.98,
      ground: 0x95c67f, cloud: 0xffffff
    },
    dusk: {
      label: '日落',
      sun:  { color: 0xffb583, intensity: 1.75, pos: [62, 13, 40] },
      fill: { color: 0x9fb6e0, intensity: 0.34 },
      hemi: { sky: 0xe0bb9c, ground: 0x6d5f52, intensity: 0.44 },
      sky:  { top: 0x35527f, mid: 0xc98b6c, bottom: 0xf3cba6, glow: 0.95, sunCol: 0xffb579 },
      fog:  { color: 0xf0bd92, near: 66, far: 300 },
      outline: 0x33324a,
      stars: 0.12,
      interior: 0.45,
      exposure: 1.04,
      ground: 0x82a067, cloud: 0xdcb193
    },
    night: {
      label: '夜晚',
      sun:  { color: 0x9ab4e6, intensity: 0.44, pos: [-46, 58, -34] },
      fill: { color: 0x5a7ab5, intensity: 0.2 },
      hemi: { sky: 0x27364f, ground: 0x141a24, intensity: 0.24 },
      sky:  { top: 0x121c38, mid: 0x22304f, bottom: 0x455a7d, glow: 0.5, sunCol: 0xbcd0ff },
      fog:  { color: 0x1c2540, near: 60, far: 280 },
      outline: 0x161c2b,
      stars: 1,
      interior: 1,
      exposure: 1.06,
      ground: 0x3d5644, cloud: 0x39435c
    }
  };

  /* ============================================================
     ARCHITECTURAL HELPERS
     ============================================================ */
  function bandRect(parent, a, b, axis, side, y0, h, color, o) {
    var len = b - a, mid = (a + b) / 2, th = 0.25;
    if (axis === 'x') return VS.bx(parent, len, h, th, mid, y0, side, color, o);
    return VS.bx(parent, th, h, len, side, y0, mid, color, o);
  }

  function glassBand(parent, a, b, axis, side, y0, h) {
    var len = b - a, mid = (a + b) / 2;
    var gm = VS.glassMat(C.glass, 0.60);
    if (axis === 'x') VS.bx(parent, len, h, 0.07, mid, y0, side, 0, { material: gm, outline: false, cast: false, receive: false });
    else VS.bx(parent, 0.07, h, len, side, y0, mid, 0, { material: gm, outline: false, cast: false, receive: false });
    var n = Math.max(2, Math.round(len / 1.75));
    for (var i = 0; i <= n; i++) {
      var p = a + len * i / n;
      if (axis === 'x') VS.bx(parent, 0.10, h + 0.02, 0.17, p, y0, side, C.frame, { thickness: 0.0011 });
      else VS.bx(parent, 0.17, h + 0.02, 0.10, side, y0, p, C.frame, { thickness: 0.0011 });
    }
    if (axis === 'x') {
      VS.bx(parent, len, 0.07, 0.17, mid, y0 - 0.04, side, C.frame, { outline: false });
      VS.bx(parent, len, 0.07, 0.17, mid, y0 + h - 0.03, side, C.frame, { outline: false });
    } else {
      VS.bx(parent, 0.17, 0.07, len, side, y0 - 0.04, mid, C.frame, { outline: false });
      VS.bx(parent, 0.17, 0.07, len, side, y0 + h - 0.03, mid, C.frame, { outline: false });
    }
  }

  function makeRamp(parent, xa, ya, xb, yb, z, width) {
    var dx = xb - xa, dy = yb - ya;
    var len = Math.sqrt(dx * dx + dy * dy);
    var g = new T.Group();
    g.position.set((xa + xb) / 2, (ya + yb) / 2, z);
    g.rotation.z = Math.atan2(dy, dx);
    parent.add(g);
    VS.bx(g, len, 0.26, width, 0, -0.26, 0, C.concrete2, { thickness: 0.0013 });
    for (var s = -1; s <= 1; s += 2) {
      VS.bx(g, len, 0.92, 0.11, 0, 0.0, s * (width / 2 - 0.055), C.white, { thickness: 0.0013 });
      VS.bx(g, len, 0.07, 0.2, 0, 0.92, s * (width / 2 - 0.055), C.white, { thickness: 0.0011 });
    }
    return g;
  }

  function spiralStair(parent, cx, cz, y0, y1, r, turns, treadColor) {
    var steps = Math.max(12, Math.round((y1 - y0) / 0.19));
    var g = new T.Group(); parent.add(g);
    var inner = 0.15, len = r - inner;
    for (var i = 0; i < steps; i++) {
      var a = (i / steps) * turns * Math.PI * 2;
      var y = y0 + (y1 - y0) * (i + 1) / steps;
      VS.bx(g, len, 0.11, 0.48, cx + Math.cos(a) * (inner + len / 2), y - 0.11, cz + Math.sin(a) * (inner + len / 2), treadColor, { thickness: 0.0011, ry: -a });
    }
    VS.cyl(g, inner, inner, y1 - y0, cx, y0, cz, C.whiteSoft, { thickness: 0.0012, seg: 16 });
    var pts = [];
    for (var k = 0; k <= 60; k++) {
      var aa = (k / 60) * turns * Math.PI * 2;
      pts.push(new T.Vector3(cx + Math.cos(aa) * (r + 0.04), y0 + 0.95 + (y1 - y0 - 0.95) * (k / 60), cz + Math.sin(aa) * (r + 0.04)));
    }
    var tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 140, 0.045, 8, false), VS.toon(C.frame));
    tube.castShadow = true; parent.add(tube);
    return g;
  }

  /* ============================================================
     THE VILLA
     ============================================================ */
  VS.buildVilla = function () {
    var g = new T.Group(); scene.add(g); VS.villa = g;

    /* ---- master dimensions ------------------------------------ */
    var HW = 9.5, HD = 6.5;            /* outer half extents        */
    var WT = 0.25;                     /* enclosure thickness       */
    var IX = HW - WT, IZ = HD - WT;    /* inner faces 9.25 / 6.25   */
    var PL = 0.3;                      /* terrace plinth            */
    var GF = 3.2, SLAB = 0.45;
    var Y1 = GF, Y1T = Y1 + SLAB;      /* 3.20 / 3.65               */
    var UH = 2.9, Y2 = Y1T + UH, Y2T = Y2 + SLAB;  /* 6.55 / 7.00   */
    var PAR = 0.95;
    var FY = Y1T + 0.06;               /* finished floor level      */
    VS.LEVELS = { PL: PL, Y1: Y1, Y1T: Y1T, Y2: Y2, Y2T: Y2T };

    /* ---- terrace plinth ---------------------------------------- */
    VS.bx(g, 20.6, PL, 14.6, 0, 0, 0, C.concrete2, { thickness: 0.0019 });

    /* ---- pilotis ----------------------------------------------- */
    var pilX = [-8.8, -3.0, 3.0, 8.8], pilZ = [-5.8, 5.8];
    for (var i = 0; i < pilX.length; i++) for (var j = 0; j < pilZ.length; j++) {
      VS.cyl(g, 0.20, 0.25, GF - PL, pilX[i], PL, pilZ[j], C.white, { seg: 20, thickness: 0.0017 });
    }

    /* ---- ground floor shell, set back behind the pilotis -------- */
    var gw = 8.2, gd = 5.2, th = 0.22, gh = GF - PL;
    var gix = gw - th;                 /* 7.98 inner face in x      */
    /* walls running in Z keep their full length and close the corners */
    /* west and east sides are glazed like the entrance front, as at Poissy */
    VS.bx(g, th, 0.4, 2 * gd, -gw + th / 2, PL, 0, C.concrete, { thickness: 0.0016 });
    VS.bx(g, th, 0.35, 2 * gd, -gw + th / 2, PL + gh - 0.35, 0, C.concrete, { thickness: 0.0016 });
    glassBand(g, -(gd - th), gd - th, 'z', -gw + th / 2, PL + 0.4, gh - 0.75);
    VS.bx(g, th, 0.4, 2 * gd, gw - th / 2, PL, 0, C.concrete, { thickness: 0.0016 });
    VS.bx(g, th, 0.35, 2 * gd, gw - th / 2, PL + gh - 0.35, 0, C.concrete, { thickness: 0.0016 });
    glassBand(g, -(gd - th), gd - th, 'z', gw - th / 2, PL + 0.4, gh - 0.75);
    /* the wall running in X stops at the inner faces: no coplanar corner faces */
    VS.bx(g, 2 * gix, gh, th, 0, PL, -gd + th / 2, C.concrete, { thickness: 0.0017 });

    /* garage door on the north side */
    VS.bx(g, 4.6, 2.5, 0.08, -5.0, PL + 0.05, -gd + th / 2 - 0.13, C.frame, { thickness: 0.0014 });
    for (var gr = 0; gr < 5; gr++) {
      VS.bx(g, 4.4, 0.30, 0.06, -5.0, PL + 0.22 + gr * 0.46, -gd + th / 2 - 0.18, C.metal, { thickness: 0.001 });
    }

    /* front : glazing either side of the curved entrance drum */
    var fz = gd - th / 2;
    VS.bx(g, 9.88, 0.4, th, -3.04, PL, fz, C.concrete, { thickness: 0.0016 });
    VS.bx(g, 9.88, 0.35, th, -3.04, PL + gh - 0.35, fz, C.concrete, { thickness: 0.0016 });
    glassBand(g, -gix, 1.9, 'x', fz, PL + 0.4, gh - 0.75);
    VS.bx(g, 1.48, 0.4, th, 7.24, PL, fz, C.concrete, { thickness: 0.0016 });
    VS.bx(g, 1.48, 0.35, th, 7.24, PL + gh - 0.35, fz, C.concrete, { thickness: 0.0016 });
    glassBand(g, 6.5, gix, 'x', fz, PL + 0.4, gh - 0.75);

    /* ---- the curved entrance drum ------------------------------ */
    var dcx = 4.2, dcz = 4.2, dr = 2.3;
    VS.cyl(g, dr, dr, gh - 0.8, dcx, PL + 0.4, dcz, 0, {
      material: VS.glassMat(C.glass, 0.60), outline: false, cast: false, receive: false,
      open: true, thetaStart: -Math.PI / 2, thetaLen: Math.PI
    });
    VS.cyl(g, dr + 0.03, dr + 0.06, 0.42, dcx, PL, dcz, C.concrete, {
      seg: 48, open: true, thetaStart: -Math.PI / 2, thetaLen: Math.PI, side: T.DoubleSide, thickness: 0.0015
    });
    VS.cyl(g, dr + 0.03, dr + 0.03, 0.4, dcx, PL + gh - 0.4, dcz, C.concrete, {
      seg: 48, open: true, thetaStart: -Math.PI / 2, thetaLen: Math.PI, side: T.DoubleSide, thickness: 0.0015
    });
    VS.cyl(g, dr, dr, 0.1, dcx, PL, dcz, C.terra, {
      seg: 48, thetaStart: -Math.PI / 2, thetaLen: Math.PI, receive: true, cast: false
    });
    for (var m = 0; m <= 6; m++) {
      var ma = -Math.PI / 2 + Math.PI * m / 6;
      VS.bx(g, 0.09, gh - 0.8, 0.09, dcx + Math.sin(ma) * dr, PL + 0.4, dcz + Math.cos(ma) * dr, C.frame, { thickness: 0.0011 });
    }
    VS.bx(g, th, gh, 0.89, 1.9, PL, 4.645, C.concrete, { thickness: 0.0016 });
    VS.bx(g, th, gh, 0.89, 6.5, PL, 4.645, C.concrete, { thickness: 0.0016 });

    /* ---- ground floor finishes and a little furniture ---------- */
    VS.bx(g, 15.8, 0.06, 9.8, 0, PL, 0, 0xe8c9a8, { outline: false, cast: false });
    VS.bx(g, 1.8, 0.4, 0.5, -6.2, PL + 0.06, 4.35, C.whiteSoft, { thickness: 0.0014 });
    VS.bx(g, 1.8, 0.1, 0.5, -6.2, PL + 0.46, 4.35, C.ochre, { thickness: 0.0012 });
    VS.bx(g, 0.44, 0.52, 0.44, -7.1, PL + 0.06, 4.3, C.terra, { thickness: 0.0012 });
    VS.sph(g, 0.52, -7.1, PL + 1.12, 4.3, C.leaf2, { detail: 1, thickness: 0.0013, sy: 0.95 });

    /* ---- second floor slab : opening for the ramp and the stair  */
    function slab(x0, x1, z0, z1, y) {
      VS.bx(g, x1 - x0, SLAB, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, C.concrete, { thickness: 0.0016 });
    }
    slab(-9.5, 9.5, -6.5, -5.1, Y1);
    slab(-9.5, -2.1, -5.1, -2.6, Y1);
    slab(0.1, 9.5, -5.1, -2.6, Y1);
    slab(-9.5, 9.5, -2.6, -1.6, Y1);
    slab(-9.5, -8.2, -1.6, 1.4, Y1);
    slab(8.2, 9.5, -1.6, 1.4, Y1);
    slab(-9.5, 9.5, 1.4, 6.5, Y1);

    /* ---- free facade : ribbon windows all round ---------------- */
    /* the pane running in X runs through to the cross pane's inner face,
       so the four glass corners butt instead of leaving an open slot */
    var GX = HW - WT / 2 - 0.035;
    var sides = [
      { axis: 'x', a: -IX, b: IX, ga: -GX, gb: GX, side: HD - WT / 2 },
      { axis: 'x', a: -IX, b: IX, ga: -GX, gb: GX, side: -(HD - WT / 2) },
      { axis: 'z', a: -HD, b: HD, ga: -HD, gb: HD, side: HW - WT / 2 },
      { axis: 'z', a: -HD, b: HD, ga: -HD, gb: HD, side: -(HW - WT / 2) }
    ];
    var sillH = 0.8, glassH = 1.3, headH = 0.8;
    for (var si = 0; si < sides.length; si++) {
      var sd = sides[si];
      bandRect(g, sd.a, sd.b, sd.axis, sd.side, Y1T, sillH, C.white, { thickness: 0.0016 });
      glassBand(g, sd.ga, sd.gb, sd.axis, sd.side, Y1T + sillH, glassH);
      bandRect(g, sd.a, sd.b, sd.axis, sd.side, Y1T + sillH + glassH, headH, C.white, { thickness: 0.0016 });
    }

    /* ---- floor finishes ---------------------------------------- */
    VS.bx(g, 18.4, 0.06, 4.7, 0, Y1T, 3.85, 0xe6cda6, { outline: false, cast: false });
    VS.bx(g, 7.0, 0.06, 4.5, -5.7, Y1T, -3.95, 0xdfd9c9, { outline: false, cast: false });
    VS.bx(g, 9.0, 0.06, 4.5, 4.68, Y1T, -3.95, 0xdfd9c9, { outline: false, cast: false });

    /* ---- partitions : the free plan ---------------------------- */
    VS.bx(g, 0.16, UH, 4.55, -6.05, Y1T, -3.975, C.white, { thickness: 0.0014 });
    VS.bx(g, 3.0, UH, 0.12, -4.1, Y1T, -6.19, C.ochre, { thickness: 0.0014 });
    VS.cyl(g, 2.0, 2.0, UH, 2.0, Y1T, 4.0, C.white, {
      seg: 48, open: true, thetaStart: 0.5, thetaLen: 2.2, side: T.DoubleSide, thickness: 0.0014
    });

    /* ---- blinds, just inside the ribbon glass ------------------ */
    VS.bx(g, 3.2, 1.0, 0.05, -4.8, FY + 1.1, 6.19, C.cream, { thickness: 0.0012, cast: false });
    VS.bx(g, 0.05, 1.0, 3.2, 9.19, FY + 1.1, 0.6, C.cream, { thickness: 0.0012, cast: false });
    VS.bx(g, 0.05, 0.8, 3.0, -9.19, FY + 1.3, 3.5, C.cream, { thickness: 0.0012, cast: false });
    VS.bx(g, 3.0, 0.7, 0.05, 2.5, FY + 1.4, -6.19, C.cream, { thickness: 0.0012, cast: false });

    /* ---- furniture --------------------------------------------- */
    function armchair(x, z, ry, col) {
      var a = new T.Group(); g.add(a);
      a.position.set(x, FY, z); a.rotation.y = ry || 0;
      VS.bx(a, 0.82, 0.30, 0.78, 0, 0.24, 0, col, { thickness: 0.0013 });
      VS.bx(a, 0.82, 0.58, 0.18, 0, 0.54, -0.30, col, { thickness: 0.0013 });
      VS.bx(a, 0.14, 0.24, 0.78, -0.34, 0.54, 0, col, { thickness: 0.0013 });
      VS.bx(a, 0.14, 0.24, 0.78, 0.34, 0.54, 0, col, { thickness: 0.0013 });
      VS.bx(a, 0.78, 0.24, 0.74, 0, 0.0, 0, C.metal, { thickness: 0.0011 });
    }
    armchair(-3.6, 3.4, 0.35, C.terra);
    armchair(-2.0, 4.4, -0.9, C.terra);
    /* coffee table */
    VS.bx(g, 1.9, 0.09, 0.95, -3.1, FY + 0.42, 3.95, 0x6a7f95, { thickness: 0.0013 });
    for (var lg = -1; lg <= 1; lg += 2) for (var lg2 = -1; lg2 <= 1; lg2 += 2) {
      VS.bx(g, 0.08, 0.42, 0.08, -3.1 + lg * 0.8, FY, 3.95 + lg2 * 0.38, C.metal, { thickness: 0.001 });
    }
    /* rug */
    VS.bx(g, 3.4, 0.04, 2.4, -5.6, FY, 3.2, C.ochre, { outline: false, cast: false });
    VS.bx(g, 2.8, 0.05, 1.8, -5.6, FY, 3.2, 0xe9d9b8, { outline: false, cast: false });
    /* bed */
    VS.bx(g, 1.7, 0.42, 2.3, -4.4, FY, -4.1, C.whiteSoft, { thickness: 0.0014 });
    VS.bx(g, 1.6, 0.16, 2.15, -4.4, FY + 0.42, -4.1, C.blush, { thickness: 0.0013 });
    VS.bx(g, 1.5, 0.2, 0.6, -4.4, FY + 0.5, -5.0, C.white, { thickness: 0.0012 });
    VS.bx(g, 1.78, 0.9, 0.14, -4.4, FY, -5.2, 0x8d7661, { thickness: 0.0013 });
    VS.bx(g, 0.5, 0.45, 0.5, -5.6, FY, -5.2, C.ochre, { thickness: 0.0012 });
    /* sofa in the north room */
    VS.bx(g, 2.6, 0.42, 0.9, 3.2, FY, -4.4, C.cerulean, { thickness: 0.0014 });
    VS.bx(g, 2.6, 0.5, 0.18, 3.2, FY + 0.42, -4.83, C.cerulean, { thickness: 0.0014 });
    VS.bx(g, 2.2, 0.16, 0.7, 3.2, FY + 0.42, -4.3, C.whiteSoft, { thickness: 0.0012 });
    /* kitchen counter */
    VS.bx(g, 3.6, 0.9, 0.7, 6.6, FY, 5.85, C.cerulean, { thickness: 0.0014 });
    VS.bx(g, 3.7, 0.08, 0.8, 6.6, FY + 0.9, 5.85, C.white, { thickness: 0.0012 });

    /* ---- ramps -------------------------------------------------- */
    makeRamp(g, -7.7, PL, 8.2, Y1T, -0.1, 2.8);
    makeRamp(g, -8.2, Y2T, 8.2, Y1T, -0.1, 2.8);

    /* ---- spiral stairs ----------------------------------------- */
    spiralStair(g, -0.9, -3.8, PL, Y1T, 0.9, 1.6, C.concrete);
    spiralStair(g, 6.5, -4.9, Y1T, Y2T, 0.95, 1.55, C.whiteSoft);

    /* ---- roof slab : ramp arrival + stair ---------------------- */
    slab(-9.5, 9.5, -6.5, -6.0, Y2);
    slab(-9.5, 5.4, -6.0, -3.8, Y2);
    slab(7.6, 9.5, -6.0, -3.8, Y2);
    slab(-9.5, 9.5, -3.8, -1.6, Y2);
    slab(-9.5, -8.2, -1.6, 1.4, Y2);
    slab(-5.8, 9.5, -1.6, 1.4, Y2);
    slab(-9.5, 9.5, 1.4, 6.5, Y2);

    /* ---- parapet : opening where the ramp arrives -------------- */
    VS.bx(g, 2 * IX, PAR, WT, 0, Y2T, HD - WT / 2, C.white, { thickness: 0.0016 });
    VS.bx(g, 2 * IX, PAR, WT, 0, Y2T, -(HD - WT / 2), C.white, { thickness: 0.0016 });
    VS.bx(g, WT, PAR, 2 * HD, HW - WT / 2, Y2T, 0, C.white, { thickness: 0.0016 });
    VS.bx(g, WT, PAR, 2 * HD, -(HW - WT / 2), Y2T, 0, C.white, { thickness: 0.0016 });

    /* ---- coping over the parapet -------------------------------- */
    VS.bx(g, 2 * IX - 0.2, 0.08, 0.32, 0, Y2T + PAR, HD - WT / 2, C.whiteSoft, { thickness: 0.0013 });
    VS.bx(g, 2 * IX - 0.2, 0.08, 0.32, 0, Y2T + PAR, -(HD - WT / 2), C.whiteSoft, { thickness: 0.0013 });
    VS.bx(g, 0.32, 0.08, 2 * HD + 0.19, HW - WT / 2, Y2T + PAR, 0, C.whiteSoft, { thickness: 0.0013 });
    VS.bx(g, 0.32, 0.08, 2 * HD + 0.19, -(HW - WT / 2), Y2T + PAR, 0, C.whiteSoft, { thickness: 0.0013 });

    /* ---- the curved solarium wall ------------------------------ */
    VS.cyl(g, 3.0, 3.0, 2.0, 4.0, Y2T, -0.8, C.white, {
      seg: 64, open: true, thetaStart: -0.45, thetaLen: 3.0, side: T.DoubleSide, thickness: 0.0017
    });
    VS.cyl(g, 2.86, 2.86, 2.0, 4.0, Y2T, -0.8, C.whiteSoft, {
      seg: 64, open: true, thetaStart: -0.45, thetaLen: 3.0, side: T.DoubleSide, thickness: 0.0012
    });
    /* skylight over the stair head */
    VS.bx(g, 2.4, 0.85, 2.4, -7.6, Y2T, -2.7, C.white, { thickness: 0.0015 });
    VS.bx(g, 2.0, 0.06, 2.0, -7.6, Y2T + 0.85, -2.7, C.glass, {
      outline: false, cast: false, material: VS.glassMat(C.glass, 0.55)
    });
    /* vent stack */
    VS.bx(g, 0.6, 1.0, 0.6, 8.2, Y2T, -5.6, C.white, { thickness: 0.0014 });
    VS.bx(g, 0.82, 0.09, 0.82, 8.2, Y2T + 1.0, -5.6, C.concrete2, { thickness: 0.0012 });

    /* ---- paving joints, lifted clear of the deck ---------------- */
    function joint(w, d, x, z) {
      VS.bx(g, w, 0.03, d, x, Y2T, z, C.concrete, { outline: false, cast: false });
    }
    joint(0.07, 5.8, 0, -0.9);
    joint(0.07, 9.7, 5.0, 1.25);
    joint(0.07, 4.5, -5.0, 3.85);
    joint(15.1, 0.07, 1.55, -3.0);
    joint(17.1, 0.07, -0.55, 2.6);
    joint(17.1, 0.07, -0.55, 5.4);

    /* ---- planting beds ----------------------------------------- */
    function bed(x0, x1, z0, z1) {
      VS.bx(g, x1 - x0, 0.34, z1 - z0, (x0 + x1) / 2, Y2T, (z0 + z1) / 2, C.concrete2, { thickness: 0.0014 });
      VS.bx(g, (x1 - x0) - 0.24, 0.1, (z1 - z0) - 0.24, (x0 + x1) / 2, Y2T + 0.34, (z0 + z1) / 2, C.grassDeep, { outline: false, cast: false });
    }
    bed(-8.9, -3.4, -6.2, -4.4);
    bed(2.6, 8.9, 3.0, 6.2);
    bed(-8.9, -4.8, 3.0, 6.2);

    /* ---- curbs framing the two roof openings -------------------- */
    function curb(w, d, x, z) {
      VS.bx(g, w, 0.22, d, x, Y2T, z, C.concrete2, { thickness: 0.0013 });
    }
    /* ramp arrival: opening x -8.2..-5.8, z -1.6..1.4 */
    curb(0.22, 3.22, -5.69, -0.1);
    curb(2.62, 0.22, -7.11, -1.71);
    curb(2.62, 0.22, -7.11, 1.51);
    /* stair opening: x 5.4..7.6, z -6.0..-3.8 */
    curb(0.22, 2.42, 5.29, -4.9);
    curb(0.22, 2.42, 7.71, -4.9);
    curb(2.20, 0.22, 6.5, -6.11);
    curb(2.20, 0.22, 6.5, -3.69);

    /* ---- potted plants along the parapet ------------------------ */
    var pots = [[-2.8, -5.85], [0.8, -5.85], [4.2, -5.85], [8.75, -2.4], [8.75, 1.0],
                [-2.4, 5.85], [0.8, 5.85], [-8.75, 2.1]];
    var potLeaf = [C.leaf1, C.leaf2, C.leaf3];
    for (var pq = 0; pq < pots.length; pq++) {
      VS.cyl(g, 0.34, 0.28, 0.52, pots[pq][0], Y2T, pots[pq][1], C.terra, { seg: 12, thickness: 0.0012 });
      VS.sph(g, 0.44, pots[pq][0], Y2T + 0.86, pots[pq][1], potLeaf[pq % 3], { detail: 1, thickness: 0.0013, sy: 0.92 });
    }

    /* ---- roof loungers ----------------------------------------- */
    for (var lz = 0; lz < 2; lz++) {
      var lx = -1.5 + lz * 0.85;
      VS.bx(g, 0.66, 0.1, 1.6, lx, Y2T + 0.34, 4.6, C.cream, { thickness: 0.0013 });
      VS.bx(g, 0.66, 0.4, 0.14, lx, Y2T + 0.44, 3.85, C.cream, { thickness: 0.0013 });
      for (var a2 = -1; a2 <= 1; a2 += 2) for (var b2 = -1; b2 <= 1; b2 += 2) {
        VS.bx(g, 0.07, 0.34, 0.07, lx + a2 * 0.26, Y2T, 4.6 + b2 * 0.62, C.metal, { thickness: 0.001 });
      }
    }

    /* ---- figures ------------------------------------------------ */
    function person(x, y, z, ry, shirt, pants, sc) {
      var p = new T.Group(); g.add(p);
      p.position.set(x, y, z); p.rotation.y = ry || 0; p.scale.setScalar(sc || 1);
      VS.bx(p, 0.34, 0.62, 0.24, 0, 0.42, 0, pants, { thickness: 0.0012 });
      VS.bx(p, 0.07, 0.42, 0.11, -0.09, 0, 0, pants, { thickness: 0.0011 });
      VS.bx(p, 0.07, 0.42, 0.11, 0.09, 0, 0, pants, { thickness: 0.0011 });
      VS.bx(p, 0.44, 0.5, 0.3, 0, 1.04, 0, shirt, { thickness: 0.0012 });
      VS.bx(p, 0.1, 0.44, 0.11, -0.27, 1.08, 0, shirt, { thickness: 0.0011 });
      VS.bx(p, 0.1, 0.44, 0.11, 0.27, 1.08, 0, shirt, { thickness: 0.0011 });
      VS.sph(p, 0.17, 0, 1.68, 0, C.skin, { detail: 2, thickness: 0.0012 });
      VS.sph(p, 0.175, 0, 1.74, 0, C.hair, { detail: 2, thickness: 0.0011, sy: 0.6 });
      return p;
    }
    person(1.0, Y2T, 1.6, 2.2, C.terra, C.dark, 1.0);
    person(-2.3, Y2T, 2.6, 0.4, C.cream, C.cerulean, 0.97);
    person(2.6, PL, 6.7, 3.1, C.cerulean, C.dark, 1.0);
    person(0.9, PL, -0.2, 1.5, C.ochre, 0x5a6478, 1.0);

    /* ---- cars ---------------------------------------------------- */
    function car(x, y, z, ry, col) {
      var c = new T.Group(); g.add(c);
      c.position.set(x, y, z); c.rotation.y = ry || 0;
      VS.bx(c, 3.7, 0.66, 1.55, 0, 0.34, 0, col, { thickness: 0.0014 });
      VS.bx(c, 1.9, 0.62, 1.42, -0.15, 0.98, 0, col, { thickness: 0.0014 });
      VS.bx(c, 1.75, 0.44, 1.3, -0.12, 1.06, 0, 0x2c3a4a, { outline: false, cast: false });
      VS.bx(c, 2.1, 0.05, 1.5, -0.2, 1.58, 0, col, { thickness: 0.0013 });
      for (var wx = -1; wx <= 1; wx += 2) for (var wz = -1; wz <= 1; wz += 2) {
        var wh = VS.cyl(c, 0.33, 0.33, 0.22, wx * 1.15, 0.23, wz * 0.72, 0x2b2f38, { seg: 14, thickness: 0.0012 });
        wh.rotation.x = Math.PI / 2;
      }
      VS.bx(c, 0.12, 0.16, 1.2, 1.85, 0.42, 0, 0xffe6b0, { outline: false, cast: false });
      return c;
    }
    car(-5.0, PL, -3.0, 0.0, C.carRed);
    car(-2.0, 0.05, 16.0, 1.22, C.cream);
    VS.groundCar = car(5.5, PL, -3.4, 0.0, C.carBlue);

    return g;
  };

  /* ============================================================
     SITE  ·  LANDSCAPE + PROPS
     ============================================================ */
  function roundedPlaneGeo(w, h, r, depth) {
    var s = new T.Shape();
    var x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    var g = new T.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  function tree(parent, x, z, sc, seed) {
    var g = new T.Group(); parent.add(g);
    g.position.set(x, 0, z); g.scale.setScalar(sc);
    g.rotation.y = seed * 2.3;
    VS.cyl(g, 0.16, 0.26, 1.9, 0, 0, 0, C.trunk, { seg: 10, thickness: 0.0014 });
    var kinds = [C.leaf1, C.leaf2, C.leaf3];
    var blobs = 3;
    for (var i = 0; i < blobs; i++) {
      var rr = 1.35 - i * 0.22 + (i === 1 ? 0.2 : 0);
      VS.sph(g, rr, (i - 1) * 0.42, 2.15 + i * 0.85, (i % 2) * 0.3 - 0.15, kinds[(i + seed) % 3], { detail: 1, thickness: 0.0015, sy: 0.9 });
    }
    VS.sph(g, 1.15, 0.15, 2.2, -0.35, C.leaf3, { detail: 1, thickness: 0.0015, sy: 0.85 });
    return g;
  }

  function bush(parent, x, z, s, col) {
    VS.sph(parent, s, x, s * 0.55, z, col, { detail: 1, thickness: 0.0014, sy: 0.75 });
    VS.sph(parent, s * 0.75, x + s * 0.75, s * 0.42, z + s * 0.3, col, { detail: 1, thickness: 0.0014, sy: 0.75 });
  }

  function flower(parent, x, z, col) {
    VS.cyl(parent, 0.03, 0.03, 0.34, x, 0.02, z, 0x6fa05c, { seg: 6, outline: false, cast: false });
    VS.sph(parent, 0.11, x, 0.42, z, col, { detail: 0, thickness: 0.001 });
  }

  VS.buildSite = function () {
    var L = new T.Group(); scene.add(L); VS.site = L;

    var lawnMat = VS.toon(C.grass);
    var lawn = new T.Mesh(roundedPlaneGeo(460, 340, 70, 0.3), lawnMat);
    lawn.position.y = -0.3;
    lawn.receiveShadow = true;
    lawn.castShadow = false;
    L.add(lawn);
    VS.lawnMat = lawnMat;

    /* soft contact darkening under the house */
    var cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    var ctx = cv.getContext('2d');
    var grd = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
    grd.addColorStop(0, 'rgba(60,72,52,0.55)');
    grd.addColorStop(0.55, 'rgba(60,72,52,0.28)');
    grd.addColorStop(1, 'rgba(60,72,52,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 256);
    var ctex = new T.CanvasTexture(cv);
    ctex.colorSpace = T.SRGBColorSpace;
    var shadowPlane = new T.Mesh(new T.PlaneGeometry(42, 32),
      new T.MeshBasicMaterial({ map: ctex, transparent: true, depthWrite: false }));
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.012;
    L.add(shadowPlane);

    /* forecourt + drive */
    var fore = new T.Mesh(roundedPlaneGeo(30, 17, 3.2, 0.07), VS.toon(C.gravel));
    fore.position.set(1.0, -0.03, 11.5);
    fore.receiveShadow = true; L.add(fore);

    var curve = new T.CatmullRomCurve3([
      new T.Vector3(-7.5, 0, 44), new T.Vector3(-6.0, 0, 30),
      new T.Vector3(-3.0, 0, 18), new T.Vector3(2.5, 0, 12.5)
    ]);
    var tg = new T.TubeGeometry(curve, 110, 2.5, 10, false);
    tg.scale(1, 0.02, 1);
    var drive = new T.Mesh(tg, VS.toon(C.gravel));
    drive.position.y = 0.035;
    drive.receiveShadow = true; L.add(drive);

    /* entrance steps */
    VS.bx(L, 6.4, 0.20, 0.70, 4.2, 0.0, 7.65, C.concrete, { thickness: 0.0013 });
    VS.bx(L, 7.4, 0.10, 0.70, 4.2, 0.0, 8.35, C.concrete, { thickness: 0.0013 });

    /* hedges along the drive */
    for (var h = 0; h < 22; h++) {
      var tt = 0.16 + (h / 21) * 0.72;
      var p = curve.getPoint(tt);
      var tgn = curve.getTangent(tt);
      var nx = -tgn.z, nz = tgn.x;
      var ang = Math.atan2(tgn.x, tgn.z);
      for (var sd = -1; sd <= 1; sd += 2) {
        VS.bx(L, 1.15, 0.62 + ((h + sd) % 3) * 0.07, 1.15,
          p.x + nx * 4.3 * sd, 0, p.z + nz * 4.3 * sd, C.grassDeep,
          { thickness: 0.0014, ry: ang });
      }
    }

    /* trees */
    var spots = [
      [-17, 13, 1.5, 0], [-20, 1, 1.7, 1], [-19, -11, 1.35, 2],
      [17.5, 14, 1.55, 1], [20.5, 2, 1.4, 0], [18.5, -12, 1.6, 2],
      [-9, -16, 1.3, 2], [3, -17, 1.45, 0], [13, -16, 1.25, 1],
      [-14, 26, 1.6, 2], [7, 30, 1.4, 1], [-24, 18, 1.5, 0], [24, 22, 1.45, 2]
    ];
    for (var i = 0; i < spots.length; i++) tree(L, spots[i][0], spots[i][1], spots[i][2], spots[i][3]);

    /* scattered shrubs near the house */
    bush(L, 12.6, 8.6, 0.95, C.leaf2); bush(L, -12.4, 8.2, 1.05, C.leaf1);
    bush(L, -12.8, -6.4, 0.9, C.leaf2); bush(L, 12.9, -6.9, 0.85, C.leaf3);
    bush(L, -14.0, 3.0, 0.8, C.leaf1); bush(L, 14.2, -1.5, 0.75, C.leaf2);

    /* flower beds */
    var cols = [0xe8695a, 0xf2b13c, 0xe98fb0, 0xf6f0d8, 0xb98ad6];
    for (var k = 0; k < 46; k++) {
      var fx = (Math.random() - 0.5) * 30;
      var fz = -9.5 - Math.random() * 5.5;
      if (Math.abs(fx) < 10.6) continue;
      flower(L, fx, fz, cols[k % cols.length]);
    }
    for (var k2 = 0; k2 < 26; k2++) {
      flower(L, 10.8 + Math.random() * 4.5, 4 + Math.random() * 8, cols[(k2 + 2) % cols.length]);
      flower(L, -10.8 - Math.random() * 4.5, -8 + Math.random() * 7, cols[(k2 + 4) % cols.length]);
    }

    /* lamp posts */
    if (!VS.interiorLights) VS.interiorLights = [];
    var lampGlowMat = new T.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, depthWrite: false });
    emissiveMats.push(lampGlowMat);
    for (var lp = 0; lp < 2; lp++) {
      var px = lp === 0 ? -10.5 : 12.0;
      var pz = lp === 0 ? 14.5 : 14.0;
      VS.cyl(L, 0.09, 0.12, 3.4, px, 0, pz, C.frame, { seg: 10, thickness: 0.0012 });
      VS.sph(L, 0.26, px, 3.62, pz, 0xfff0c8, { detail: 2, thickness: 0.0012 });
      var halo = new T.Mesh(new T.IcosahedronGeometry(0.42, 2), lampGlowMat);
      halo.position.set(px, 3.62, pz);
      L.add(halo);
      var lampLight = new T.PointLight(0xffd49a, 0, 26, 2);
      lampLight.position.set(px, 3.5, pz);
      L.add(lampLight);
      VS.interiorLights.push({ light: lampLight, base: 7 });
    }

    /* birds */
    LS.birds = [];
    var bmat = VS.toon(0x3f4657, { outline: false, cast: false });
    for (var b = 0; b < 6; b++) {
      var bg = new T.Group();
      var body = new T.Mesh(new T.BoxGeometry(0.32, 0.16, 0.3), bmat); bg.add(body);
      var w1 = new T.Mesh(new T.BoxGeometry(0.95, 0.05, 0.26), bmat); w1.position.x = -0.6; bg.add(w1);
      var w2 = new T.Mesh(new T.BoxGeometry(0.95, 0.05, 0.26), bmat); w2.position.x = 0.6; bg.add(w2);
      bg.userData = { w1: w1, w2: w2, r: 32 + Math.random() * 46, y: 15 + Math.random() * 14, ph: Math.random() * 6.28, sp: 0.06 + Math.random() * 0.05 };
      scene.add(bg);
      LS.birds.push(bg);
    }
    return L;
  };
  var LS = {};

  /* ============================================================
     INTERIOR LIGHTING (for the night mood)
     ============================================================ */
  VS.buildInterior = function () {
    var iv = new T.Group(); scene.add(iv); VS.interior = iv;
    var lampMat = new T.MeshBasicMaterial({ color: 0xffdcae, transparent: true, opacity: 0 });
    emissiveMats.push(lampMat);
    /* glowing ceiling panels so the rooms read as lit at night */
    var panMat = new T.MeshBasicMaterial({ color: 0xffd9a4, transparent: true, opacity: 0, depthWrite: false });
    emissiveMats.push(panMat);
    var pans = [[-5.0, 3.12, 2.4], [1.0, 3.12, 2.4], [5.5, 3.12, -2.0], [-4.0, 3.12, -2.0],
                [-5.0, 6.47, 3.0], [0.0, 6.47, 3.0], [5.6, 6.47, 5.0], [-4.5, 6.47, -4.5], [3.0, 6.47, -5.2]];
    for (var pn = 0; pn < pans.length; pn++) {
      var pane = new T.Mesh(new T.BoxGeometry(3.0, 0.04, 1.8), panMat);
      pane.position.set(pans[pn][0], pans[pn][1], pans[pn][2]);
      iv.add(pane);
    }
    /* lit wall washes on the inner faces, facing the ribbon windows */
    var wallGlowMat = new T.MeshBasicMaterial({ color: 0xffd7a0, transparent: true, opacity: 0, depthWrite: false });
    emissiveMats.push(wallGlowMat);
    var walls = [
      [3.0, 1.2, 0.06, -6.0, 5.1,  6.0], [3.0, 1.2, 0.06, -1.5, 5.1,  6.0],
      [3.0, 1.2, 0.06, -6.0, 5.1, -6.0], [3.0, 1.2, 0.06,  2.0, 5.1, -6.0],
      [0.06, 1.2, 3.0,  9.0, 5.1, -4.0], [0.06, 1.2, 3.0,  9.0, 5.1,  1.0],
      [0.06, 1.2, 3.0, -9.0, 5.1, -4.0], [0.06, 1.2, 3.0, -9.0, 5.1,  2.0],
      [3.0, 1.5, 0.06, -3.0, 1.7, -4.90], [3.0, 1.5, 0.06, 3.0, 1.7, -4.90],
      [3.0, 1.5, 0.06, -3.0, 1.7,  5.00], [3.0, 1.5, 0.06, 3.0, 1.7,  5.00]
    ];
    for (var wn = 0; wn < walls.length; wn++) {
      var w0 = walls[wn];
      var wm = new T.Mesh(new T.BoxGeometry(w0[0], w0[1], w0[2]), wallGlowMat);
      wm.position.set(w0[3], w0[4], w0[5]);
      iv.add(wm);
    }
    var pos = [
      [-3.0, 2.55, 1.5, 10], [5.5, 2.55, -2.0, 10],
      [-4.0, 5.7, 2.0, 11], [5.0, 5.7, -2.5, 11], [0.0, 5.7, 4.0, 10]
    ];
    if (!VS.interiorLights) VS.interiorLights = [];
    for (var i = 0; i < pos.length; i++) {
      var p = pos[i];
      var s = new T.Mesh(new T.SphereGeometry(0.22, 14, 10), lampMat);
      s.position.set(p[0], p[1], p[2]);
      iv.add(s);
      var pl = new T.PointLight(0xffcf92, 0, 18, 2);
      pl.position.set(p[0], p[1], p[2]);
      iv.add(pl);
      VS.interiorLights.push({ light: pl, base: p[3] });
    }
    return iv;
  };

  /* ============================================================
     MOOD ENGINE
     ============================================================ */
  function snapshot(m) {
    return {
      sunColor: new T.Color(m.sun.color), sunInt: m.sun.intensity, sunPos: new T.Vector3().fromArray(m.sun.pos),
      fillColor: new T.Color(m.fill.color), fillInt: m.fill.intensity,
      hemiSky: new T.Color(m.hemi.sky), hemiGround: new T.Color(m.hemi.ground), hemiInt: m.hemi.intensity,
      skyTop: new T.Color(m.sky.top), skyMid: new T.Color(m.sky.mid), skyBottom: new T.Color(m.sky.bottom),
      glow: m.sky.glow, sunCol: new T.Color(m.sky.sunCol),
      fogColor: new T.Color(m.fog.color), fogNear: m.fog.near, fogFar: m.fog.far,
      outline: new T.Color(m.outline), stars: m.stars, interior: m.interior,
      ground: new T.Color(m.ground), cloud: new T.Color(m.cloud)
    };
  }
  function cloneSnap(s) {
    var o = {};
    for (var k in s) {
      var v = s[k];
      o[k] = (v && v.isColor) ? v.clone() : (v && v.isVector3) ? v.clone() : v;
    }
    return o;
  }
  var moodCur, moodTgt, moodName = 'dawn';

  VS.initMood = function (name) {
    moodName = name || 'dawn';
    moodCur = snapshot(VS.MOODS[moodName]);
    moodTgt = cloneSnap(moodCur);
    var m = VS.MOODS[moodName];
    scene.fog = new T.Fog(moodCur.fogColor.clone(), moodCur.fogNear, moodCur.fogFar);
    applyMoodFrame();
  };
  VS.setMood = function (name) {
    if (!VS.MOODS[name]) return;
    moodName = name;
    var s = snapshot(VS.MOODS[name]);
    moodTgt = s;
  };
  VS.moodName = function () { return moodName; };

  VS.snapMood = function () {
    moodCur = cloneSnap(moodTgt);
    applyMoodFrame();
  };
  function lerpSnap(cur, tgt, k) {
    for (var key in tgt) {
      var t = tgt[key], c = cur[key];
      if (t && t.isColor) c.lerp(t, k);
      else if (t && t.isVector3) c.lerp(t, k);
      else cur[key] = c + (t - c) * k;
    }
  }
  function applyMoodFrame() {
    var s = moodCur;
    sun.color.copy(s.sunColor); sun.intensity = s.sunInt;
    sun.position.copy(s.sunPos);
    fill.color.copy(s.fillColor); fill.intensity = s.fillInt;
    hemi.color.copy(s.hemiSky); hemi.groundColor.copy(s.hemiGround); hemi.intensity = s.hemiInt;
    skyMat.uniforms.uTop.value.copy(s.skyTop);
    skyMat.uniforms.uMid.value.copy(s.skyMid);
    skyMat.uniforms.uBottom.value.copy(s.skyBottom);
    skyMat.uniforms.uGlow.value = s.glow;
    skyMat.uniforms.uSunCol.value.copy(s.sunCol);
    skyMat.uniforms.uSunDir.value.copy(s.sunPos).normalize();
    scene.fog.color.copy(s.fogColor); scene.fog.near = s.fogNear; scene.fog.far = s.fogFar;
    stars.material.opacity = s.stars;
    VS.setOutlineColor(s.outline.getHex());
    if (VS.lawnMat) VS.lawnMat.color.copy(s.ground);
    if (VS.cloudMat) VS.cloudMat.color.copy(s.cloud);
    for (var i = 0; i < emissiveMats.length; i++) emissiveMats[i].opacity = s.interior;
    if (VS.interiorLights) for (var j = 0; j < VS.interiorLights.length; j++) {
      VS.interiorLights[j].light.intensity = s.interior * VS.interiorLights[j].base;
    }
    for (var q = 0; q < glassMats.length; q++) {
      glassMats[q].opacity = 0.60 - s.interior * 0.10;
      glassMats[q].color.copy(glassBase).lerp(warmGlass, s.interior * 0.5);
    }
  }
  VS.updateMood = function (dt) {
    var k = 1 - Math.exp(-dt * 3.0);
    lerpSnap(moodCur, moodTgt, k);
    applyMoodFrame();
  };

  /* ============================================================
     CAMERA RIG
     ============================================================ */
  var rig = {
    theta: 1.05, phi: 1.06, radius: 80,
    tTheta: 0.94, tPhi: 1.13, tRadius: 45,
    target: new T.Vector3(0, 3.6, 0), tTarget: new T.Vector3(0, 3.8, 0),
    autoRotate: true, dragging: false, settled: 0
  };
  VS.rig = rig;

  VS.VIEWS = {
    hero:   { theta: 0.94, phi: 1.13, radius: 45, target: [0, 3.9, 0] },
    front:  { theta: 0.00, phi: 1.36, radius: 41, target: [0, 4.1, 0] },
    ribbon: { theta: 0.66, phi: 1.28, radius: 22, target: [3.5, 4.9, 1.2] },
    roof:   { theta: 1.18, phi: 1.00, radius: 26, target: [0.6, 7.2, -0.4] },
    entry:  { theta: 0.34, phi: 1.42, radius: 15, target: [4.2, 1.9, 4.6] },
    plan:   { theta: 0.10, phi: 0.17, radius: 52, target: [0, 0.5, 0] }
  };
  VS.flyTo = function (key) {
    var v = VS.VIEWS[key]; if (!v) return;
    rig.tTheta = v.theta; rig.tPhi = v.phi; rig.tRadius = v.radius;
    rig.tTarget.set(v.target[0], v.target[1], v.target[2]);
  };

  function updateCamera(dt) {
    var k = 1 - Math.exp(-dt * 2.7);
    rig.theta += (rig.tTheta - rig.theta) * k;
    rig.phi += (rig.tPhi - rig.phi) * k;
    rig.radius += (rig.tRadius - rig.radius) * k;
    rig.target.lerp(rig.tTarget, k);
    if (rig.autoRotate && !rig.dragging) {
      var sp = 0.055 * dt * (1 + (1 - Math.min(1, Math.abs(rig.radius - rig.tRadius) / 30)) * 0.5);
      rig.theta += sp; rig.tTheta += sp;
    }
    rig.phi = Math.max(0.06, Math.min(1.535, rig.phi));
    rig.tPhi = Math.max(0.06, Math.min(1.535, rig.tPhi));
    var r = rig.radius;
    var sp2 = Math.sin(rig.phi);
    camera.position.set(
      rig.target.x + r * sp2 * Math.sin(rig.theta),
      rig.target.y + r * Math.cos(rig.phi),
      rig.target.z + r * sp2 * Math.cos(rig.theta)
    );
    camera.lookAt(rig.target);
  }
  VS.updateCamera = updateCamera;

  VS.bindControls = function (canvas) {
    var last = null;
    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY, btn: e.button };
      rig.dragging = true;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!last) return;
      var dx = e.clientX - last.x, dy = e.clientY - last.y;
      last.x = e.clientX; last.y = e.clientY;
      if (last.btn === 2 || e.shiftKey) {
        var right = new T.Vector3().subVectors(camera.position, rig.target).cross(new T.Vector3(0, 1, 0)).normalize();
        var up = new T.Vector3(0, 1, 0);
        var scale = rig.radius * 0.0016;
        var move = new T.Vector3().addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
        rig.tTarget.add(move); rig.target.add(move);
      } else {
        rig.tTheta -= dx * 0.0062; rig.theta -= dx * 0.0062;
        rig.tPhi -= dy * 0.0052; rig.phi -= dy * 0.0052;
      }
    });
    function end(e) { last = null; rig.dragging = false; }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var f = Math.exp(e.deltaY * 0.0011);
      rig.tRadius = Math.max(11, Math.min(120, rig.tRadius * f));
    }, { passive: false });

    /* touch pinch */
    var pinch = null;
    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinch) rig.tRadius = Math.max(11, Math.min(120, rig.tRadius * (pinch / d)));
        pinch = d;
      }
    }, { passive: true });
    canvas.addEventListener('touchend', function () { pinch = null; });
  };

  /* ============================================================
     ANNOTATIONS  (the five points)
     ============================================================ */
  var ANNOTS = [
    { id: 'a1', zh: '底层架空', fr: 'Les pilotis',            p: [-8.8, 2.0, 5.8],  off: [-235, 68] },
    { id: 'a2', zh: '屋顶花园', fr: 'Le toit-jardin',         p: [0.6, 7.7, 1.2],   off: [95, -130] },
    { id: 'a3', zh: '自由平面', fr: 'Le plan libre',          p: [0.0, 4.6, -0.4],  off: [-60, -190] },
    { id: 'a4', zh: '横向长窗', fr: 'La fenêtre en longueur', p: [9.5, 4.75, -3.4], off: [250, 10] },
    { id: 'a5', zh: '自由立面', fr: 'La façade libre',        p: [6.0, 5.6, 6.5],   off: [175, 95] }
  ];
  var annotEls = [], annotOn = false;

  VS.buildAnnotations = function () {
    var layer = document.getElementById('annotLayer');
    var svg = document.getElementById('annotLines');
    ANNOTS.forEach(function (a) {
      var d = document.createElement('div');
      d.className = 'annot';
      d.innerHTML = '<span class="dot"></span>' +
        '<div class="txt"><b>' + a.zh + '</b><i>' + a.fr + '</i></div>';
      layer.appendChild(d);
      var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('stroke', 'rgba(46,52,66,0.75)');
      ln.setAttribute('stroke-width', '1.4');
      ln.setAttribute('stroke-dasharray', '1 5');
      ln.setAttribute('stroke-linecap', 'round');
      svg.appendChild(ln);
      annotEls.push({ def: a, el: d, line: ln });
    });
  };
  VS.setAnnotations = function (on) {
    annotOn = on;
    document.getElementById('annotLayer').style.opacity = on ? '1' : '0';
    document.getElementById('annotLines').style.opacity = on ? '1' : '0';
  };
  var v3 = new T.Vector3();
  function updateAnnotations() {
    if (!annotOn) return;
    var w = window.innerWidth, h = window.innerHeight;
    for (var i = 0; i < annotEls.length; i++) {
      var A = annotEls[i];
      v3.set(A.def.p[0], A.def.p[1], A.def.p[2]).project(camera);
      var sx = (v3.x * 0.5 + 0.5) * w;
      var sy = (-v3.y * 0.5 + 0.5) * h;
      var behind = v3.z > 1;
      var lx = sx + A.def.off[0];
      var ly = sy + A.def.off[1];
      lx = Math.max(90, Math.min(w - 90, lx));
      ly = Math.max(70, Math.min(h - 70, ly));
      A.el.style.transform = 'translate(' + lx + 'px,' + ly + 'px)';
      A.el.style.opacity = behind ? '0' : '1';
      A.line.setAttribute('x1', sx);
      A.line.setAttribute('y1', sy);
      A.line.setAttribute('x2', lx + (A.def.off[0] > 0 ? -26 : 26));
      A.line.setAttribute('y2', ly);
      A.line.style.opacity = behind ? '0' : '1';
    }
  }

  /* ============================================================
     UI
     ============================================================ */
  VS.bindUI = function () {
    document.querySelectorAll('.mood-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        VS.setMood(b.getAttribute('data-mood'));
        document.querySelectorAll('.mood-btn').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
    });
    document.querySelectorAll('.view-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        VS.flyTo(b.getAttribute('data-view'));
        document.querySelectorAll('.view-btn').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
    });
    var tr = document.getElementById('tglRotate');
    tr.addEventListener('click', function () {
      rig.autoRotate = !rig.autoRotate;
      tr.classList.toggle('on', rig.autoRotate);
    });
    var ta = document.getElementById('tglAnnot');
    ta.addEventListener('click', function () {
      var on = !ta.classList.contains('on');
      ta.classList.toggle('on', on);
      VS.setAnnotations(on);
    });
    var panel = document.getElementById('panel');
    var tp = document.getElementById('tglPanel');
    tp.addEventListener('click', function () {
      var open = panel.classList.toggle('open');
      tp.classList.toggle('on', open);
    });
    document.getElementById('panelClose').addEventListener('click', function () {
      panel.classList.remove('open'); tp.classList.remove('on');
    });
    document.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (k === 'r') tr.click();
      else if (k === 'a') ta.click();
      else if (k === 'i') tp.click();
      else if (k === '1') document.querySelector('[data-mood="dawn"]').click();
      else if (k === '2') document.querySelector('[data-mood="noon"]').click();
      else if (k === '3') document.querySelector('[data-mood="dusk"]').click();
      else if (k === '4') document.querySelector('[data-mood="night"]').click();
    });
  };

  /* ============================================================
     MAIN LOOP
     ============================================================ */
  var elapsed = 0, firstFrame = true;
  VS.start = function () {
    function frame() {
      requestAnimationFrame(frame);
      var dt = Math.min(clock.getDelta(), 0.06);
      elapsed += dt;
      VS.updateMood(dt);
      updateCamera(dt);

      /* clouds drift */
      for (var i = 0; i < clouds.length; i++) {
        var c = clouds[i];
        c.position.x += c.userData.speed * dt * 2.0;
        if (c.position.x > 210) c.position.x = -210;
      }
      /* birds */
      if (LS.birds) for (var b = 0; b < LS.birds.length; b++) {
        var bd = LS.birds[b].userData;
        var a = elapsed * bd.sp * 6.28 + bd.ph;
        LS.birds[b].position.set(Math.cos(a) * bd.r, bd.y + Math.sin(elapsed * 0.7 + bd.ph) * 1.6, Math.sin(a) * bd.r);
        LS.birds[b].rotation.y = -a;
        var flap = Math.sin(elapsed * 7 + bd.ph) * 0.55;
        bd.w1.rotation.z = flap; bd.w2.rotation.z = -flap;
      }

      renderer.render(scene, camera);
      updateAnnotations();

      if (firstFrame) {
        firstFrame = false;
        var ld = document.getElementById('loader');
        if (ld) { ld.classList.add('gone'); setTimeout(function () { ld.style.display = 'none'; }, 900); }
      }
    }
    frame();
  };

  window.addEventListener('resize', function () {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ============================================================
     BOOT
     ============================================================ */
  VS.boot = function () {
   try {
    var canvas = document.getElementById('stage');
    VS.initCore(canvas);
    VS.initMood('dawn');
    VS.buildVilla();
    VS.buildSite();
    VS.buildInterior();
    VS.buildAnnotations();
    VS.bindControls(canvas);
    VS.bindUI();
    VS.setAnnotations(false);
    VS.flyTo('hero');
    var qs = new URLSearchParams(window.location.search);
    var qv = qs.get('view'); if (qv && VS.VIEWS[qv]) VS.flyTo(qv);
    var qm = qs.get('mood'); if (qm && VS.MOODS[qm]) VS.setMood(qm);
    if (qs.get('annot') === '1') {
      VS.setAnnotations(true);
      document.getElementById('tglAnnot').classList.add('on');
    }
    if (VS.STILL) {
      rig.theta = rig.tTheta; rig.phi = rig.tPhi; rig.radius = rig.tRadius;
      rig.target.copy(rig.tTarget);
      VS.snapMood();
      updateCamera(1);
      ['#titlebar', '#moods', '#views', '#tools', '#hint'].forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) { el.style.animation = 'none'; el.style.opacity = '1'; el.style.transform = 'none'; }
      });
      renderer.render(scene, camera);
      updateAnnotations();
      try {
        var gl = renderer.getContext();
        var h = renderer.domElement.height, w = renderer.domElement.width;
        var px = new Uint8Array(4), out = [];
        var probes = [[0.5, 0.5], [0.5, 0.2], [0.2, 0.5], [0.75, 0.75], [0.5, 0.85]];
        for (var pi = 0; pi < probes.length; pi++) {
          gl.readPixels(Math.floor(w * probes[pi][0]), Math.floor(h * probes[pi][1]), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          out.push(px[0] + '.' + px[1] + '.' + px[2]);
        }
        document.documentElement.setAttribute('data-px', out.join('|'));
        document.documentElement.setAttribute('data-size', w + 'x' + h);
      } catch (e2) { document.documentElement.setAttribute('data-px', 'ERR ' + e2.message); }
      var ld0 = document.getElementById('loader'); if (ld0) ld0.style.display = 'none';
      document.documentElement.setAttribute('data-boot', 'ok');
      return;
    }
    VS.start();
    document.documentElement.setAttribute('data-boot', 'ok');
   } catch (err) {
    document.documentElement.setAttribute('data-boot', 'fail');
    var eb = document.getElementById('errbox');
    if (eb) { eb.style.cssText = 'position:fixed;z-index:99;left:12px;top:12px;max-width:92%;background:#fff;color:#b00;font:12px/1.5 monospace;padding:10px 12px;border:1px solid #b00;white-space:pre-wrap;'; eb.textContent += String(err && err.stack || err) + '\n'; }
   }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', VS.boot);
  else VS.boot();
})();
