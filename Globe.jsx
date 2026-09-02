'use client';
import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

const NODES = [
  [-2.1, 0.55, 0.4], [-1.5,-1.15,-0.5], [2.2, 0.95,-0.3], [2.0,-0.85, 0.5],
];

function fib(n, r=1) {
  const p=[], g=Math.PI*(3-Math.sqrt(5));
  for (let i=0;i<n;i++){ const y=1-(i/(n-1))*2, rr=Math.sqrt(Math.max(0,1-y*y)), t=g*i;
    p.push(new THREE.Vector3(Math.cos(t)*rr*r, y*r, Math.sin(t)*rr*r)); }
  return p;
}

function Mesh() {
  const g = useRef();
  const { dots, lines } = useMemo(() => {
    const n = fib(420, 2), pos = [];
    for (let i=0;i<n.length;i++) for (let j=i+1;j<n.length;j++)
      if (n[i].distanceTo(n[j]) < 0.34) pos.push(...n[i].toArray(), ...n[j].toArray());
    const d = new Float32Array(n.length*3); n.forEach((v,i)=>d.set(v.toArray(), i*3));
    return { dots:d, lines:new Float32Array(pos) };
  }, []);
  useFrame((s, dt) => {
    if (!g.current) return;
    g.current.rotation.y += dt*0.055;
    g.current.rotation.x += ((s.pointer.y*0.22+0.14) - g.current.rotation.x)*0.04;
  });
  return (
    <group ref={g}>
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" array={dots} count={dots.length/3} itemSize={3} /></bufferGeometry>
        <pointsMaterial size={0.022} color="#F5F5F2" transparent opacity={0.55} sizeAttenuation />
      </points>
      <lineSegments>
        <bufferGeometry><bufferAttribute attach="attributes-position" array={lines} count={lines.length/3} itemSize={3} /></bufferGeometry>
        <lineBasicMaterial color="#F5F5F2" transparent opacity={0.07} />
      </lineSegments>
      {/* opaque body so the far hemisphere is occluded and the silhouette stays clean */}
      <mesh><sphereGeometry args={[1.965,64,64]} /><meshBasicMaterial color="#050505" /></mesh>
      {NODES.map((p,i) => <Node key={i} p={p} />)}
    </group>
  );
}

function Node({ p }) {
  const r = useRef();
  const v = useMemo(() => new THREE.Vector3(...p).normalize().multiplyScalar(2.02), [p]);
  useFrame(s => { if (r.current) r.current.scale.setScalar(1 + Math.sin(s.clock.elapsedTime*1.6 + v.x)*0.18); });
  return <mesh ref={r} position={v}>
    <sphereGeometry args={[0.05,16,16]} />
    {/* emissive and untonemapped so the bloom pass has something real to pick up */}
    <meshBasicMaterial color="#3ECF8E" toneMapped={false} />
  </mesh>;
}

export default function Globe({ className='' }) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas dpr={[1,2]} camera={{ position:[0,0,6.2], fov:42 }}
        gl={{ antialias:true, alpha:true, powerPreference:'high-performance' }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <Mesh />
          <EffectComposer disableNormalPass>
            <Bloom intensity={1.15} luminanceThreshold={0.22} luminanceSmoothing={0.9} mipmapBlur />
            <Vignette eskil={false} offset={0.22} darkness={0.85} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
