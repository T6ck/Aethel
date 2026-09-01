'use client';

import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { SITES } from '@/lib/data';

/* Fibonacci sphere. Even coverage with no pole clustering, which a
   naive lat/long grid always shows. */
function fibSphere(n, r = 1) {
  const pts = [], gold = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = gold * i;
    pts.push(new THREE.Vector3(Math.cos(th) * rad * r, y * r, Math.sin(th) * rad * r));
  }
  return pts;
}

/* The mesh. Points on a sphere plus short great-circle links between
   near neighbours, so it reads as a network rather than noise. */
function Mesh({ reduced }) {
  const group = useRef();
  const { nodes, lines } = useMemo(() => {
    const nodes = fibSphere(420, 2);
    const pos = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = nodes[i].distanceTo(nodes[j]);
        if (d < 0.34) { pos.push(...nodes[i].toArray(), ...nodes[j].toArray()); }
      }
    }
    return { nodes, lines: new Float32Array(pos) };
  }, []);

  const dots = useMemo(() => {
    const a = new Float32Array(nodes.length * 3);
    nodes.forEach((n, i) => a.set(n.toArray(), i * 3));
    return a;
  }, [nodes]);

  useFrame((state, dt) => {
    if (!group.current || reduced) return;
    group.current.rotation.y += dt * 0.055;
    const p = state.pointer;
    group.current.rotation.x += ((p.y * 0.22 + 0.14) - group.current.rotation.x) * 0.04;
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={dots} count={dots.length / 3} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.022} color="#F5F5F2" transparent opacity={0.55} sizeAttenuation />
      </points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={lines} count={lines.length / 3} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#F5F5F2" transparent opacity={0.07} />
      </lineSegments>
      {/* the dark body, so the far hemisphere is occluded rather than
          showing through and muddying the silhouette */}
      <mesh>
        <sphereGeometry args={[1.965, 64, 64]} />
        <meshBasicMaterial color="#050505" />
      </mesh>
      {SITES.map((s) => (
        <Node key={s.id} position={s.pos} reduced={reduced} />
      ))}
    </group>
  );
}

/* A live site. Emissive so the bloom pass actually has something to
   pick up, which is the whole reason this is WebGL and not a canvas. */
function Node({ position, reduced }) {
  const ref = useRef();
  const dir = useMemo(() => new THREE.Vector3(...position).normalize().multiplyScalar(2.02), [position]);
  useFrame((state) => {
    if (!ref.current || reduced) return;
    const t = state.clock.elapsedTime;
    ref.current.scale.setScalar(1 + Math.sin(t * 1.6 + dir.x) * 0.18);
  });
  return (
    <mesh ref={ref} position={dir}>
      <sphereGeometry args={[0.05, 16, 16]} />
      <meshBasicMaterial color="#3ECF8E" toneMapped={false} />
    </mesh>
  );
}

/* Packets in transit. Each rides a great circle between two live sites,
   so motion marks a relationship that is actually carrying something. */
function Packets({ reduced }) {
  const ref = useRef();
  const curves = useMemo(() => {
    const out = [];
    for (let i = 0; i < SITES.length; i++) {
      const a = new THREE.Vector3(...SITES[i].pos).normalize().multiplyScalar(2.02);
      const b = new THREE.Vector3(...SITES[(i + 1) % SITES.length].pos).normalize().multiplyScalar(2.02);
      const mid = a.clone().add(b).normalize().multiplyScalar(2.42);
      out.push(new THREE.QuadraticBezierCurve3(a, mid, b));
    }
    return out;
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = reduced ? 0.3 : state.clock.elapsedTime;
    curves.forEach((c, i) => {
      const p = c.getPoint(((t * 0.22 + i / curves.length) % 1));
      dummy.position.copy(p);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {curves.map((c, i) => (
        <line key={i}>
          <bufferGeometry attach="geometry" {...new THREE.BufferGeometry().setFromPoints(c.getPoints(48))} />
          <lineBasicMaterial color="#3ECF8E" transparent opacity={0.16} />
        </line>
      ))}
      <instancedMesh ref={ref} args={[null, null, curves.length]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshBasicMaterial color="#3ECF8E" toneMapped={false} />
      </instancedMesh>
    </>
  );
}

export default function Globe({ className = '', reduced = false }) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        dpr={[1, 2]}                        /* cap DPR, retina fill rate is what kills frames */
        camera={{ position: [0, 0, 6.2], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        frameloop={reduced ? 'demand' : 'always'}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <Mesh reduced={reduced} />
          <Packets reduced={reduced} />
          <EffectComposer disableNormalPass>
            {/* the bloom the canvas version could not do: emissive nodes
                actually glow rather than being flat green dots */}
            <Bloom intensity={1.15} luminanceThreshold={0.22} luminanceSmoothing={0.9} mipmapBlur />
            <Vignette eskil={false} offset={0.22} darkness={0.85} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
