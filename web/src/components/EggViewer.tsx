"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const FALLBACK_MODEL = "/models/molting-egg.glb";

function EggModel({ modelPath }: { modelPath: string }) {
  const { scene } = useGLTF(modelPath);
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group ref={ref} position={[0, -0.8, 0]}>
      <primitive object={scene.clone()} scale={0.8} />
    </group>
  );
}

export default function EggViewer({ model }: { model: string | null }) {
  const modelPath = model ? `/models/${model}` : FALLBACK_MODEL;

  return (
    <div
      className="w-full max-w-[280px] mx-auto"
      style={{ imageRendering: "pixelated", height: 260 }}
    >
      <Canvas
        dpr={0.18}
        gl={{ antialias: false, alpha: true }}
        camera={{ position: [0, 1.2, 4.5], fov: 30 }}
        style={{ imageRendering: "pixelated" }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-3, 2, -2]} intensity={0.3} color="#8888ff" />
        <Suspense fallback={null}>
          <EggModel modelPath={modelPath} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Preload all egg models
if (typeof window !== "undefined") {
  useGLTF.preload("/models/molting-egg.glb");
  useGLTF.preload("/models/jagged-egg.glb");
  useGLTF.preload("/models/dense-egg.glb");
  useGLTF.preload("/models/keycap-egg.glb");
}
