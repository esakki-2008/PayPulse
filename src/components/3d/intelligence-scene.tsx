"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { CoreFallback } from "./core-fallback";
import { intelligenceStageIndex, intelligenceStages, type IntelligenceStage } from "@/components/ui/intelligence-lifecycle";
import type { CoreState, Customer } from "@/types/domain";

const stateColors: Record<CoreState, string> = {
  idle: "#67e8f9",
  analyzing: "#38bdf8",
  insight_detected: "#fbbf24",
  recommending: "#b8a0ff",
  awaiting_approval: "#fbbf24",
  approved: "#4de4b3",
  executing: "#d2a8ff",
  completed: "#42e0c7",
  failed: "#fb7185",
  learning: "#67e8f9",
};

const stagePositions: readonly [number, number, number][] = [
  [-4.0, 1.7, -0.25],
  [-3.25, -1.85, 0.3],
  [-1.05, -2.85, 0.1],
  [1.8, -2.5, 0.18],
  [3.85, -0.9, 0.15],
  [3.5, 1.85, 0.08],
  [0.55, 3.05, 0.12],
] as const;

function CoreOrb({ state }: { readonly state: CoreState }) {
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const lattice = useRef<THREE.Mesh>(null);
  const color = stateColors[state];

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const pulse = state === "executing" ? 2.7 : state === "learning" ? 2.2 : 1.45;
    if (core.current) {
      const scale = 1 + Math.sin(time * pulse) * 0.055;
      core.current.scale.setScalar(scale);
      core.current.rotation.y = time * 0.13;
    }
    if (shell.current) {
      shell.current.rotation.x = time * 0.075;
      shell.current.rotation.z = time * -0.052;
    }
    if (lattice.current) lattice.current.rotation.y = time * -0.15;
  });

  return (
    <group>
      <pointLight color={color} intensity={5.2} distance={12} decay={1.8} />
      <pointLight color="#2d9cfa" intensity={1.5} distance={8} position={[0, 1.5, 2]} />
      <mesh ref={core}>
        <icosahedronGeometry args={[1.24, 5]} />
        <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={1.35} roughness={0.14} metalness={0.38} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
      <mesh ref={lattice} scale={1.37}>
        <icosahedronGeometry args={[1, 3]} />
        <meshBasicMaterial color="#d5fbff" wireframe transparent opacity={0.18} />
      </mesh>
      <mesh ref={shell} scale={1.76}>
        <sphereGeometry args={[1, 38, 38]} />
        <meshPhysicalMaterial color="#aeefff" transparent opacity={0.07} roughness={0.08} metalness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function OrbitalRing({ radius, rotation, color, speed }: { readonly radius: number; readonly rotation: [number, number, number]; readonly color: string; readonly speed: number }) {
  const ring = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ring.current) ring.current.rotation.z = rotation[2] + clock.getElapsedTime() * speed; });
  return <group ref={ring} rotation={rotation}><mesh><torusGeometry args={[radius, 0.014, 10, 96]} /><meshBasicMaterial color={color} transparent opacity={0.76} /></mesh></group>;
}

function ParticleField({ compact }: { readonly compact: boolean }) {
  const positions = useMemo(() => {
    const count = compact ? 42 : 108;
    const points = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399963229728653;
      const radius = 2.4 + (index % 12) * 0.26;
      points[index * 3] = Math.cos(angle) * radius;
      points[index * 3 + 1] = ((index % 9) - 4) * 0.38;
      points[index * 3 + 2] = Math.sin(angle) * radius;
    }
    return points;
  }, [compact]);
  const points = useRef<THREE.Points>(null);
  useFrame(({ clock }) => { if (points.current) points.current.rotation.y = clock.getElapsedTime() * 0.026; });
  return <points ref={points}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial color="#a5f3fc" size={compact ? 0.027 : 0.037} sizeAttenuation transparent opacity={0.72} /></points>;
}

function DataFlow({ state, compact }: { readonly state: CoreState; readonly compact: boolean }) {
  const particles = useRef<(THREE.Mesh | null)[]>([]);
  const activeStage = intelligenceStageIndex(state);
  const count = compact ? 9 : 19;

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    particles.current.forEach((particle, index) => {
      if (!particle) return;
      const start = stagePositions[(index + activeStage) % stagePositions.length]!;
      const phase = (time * 0.17 + index / count) % 1;
      const eased = phase * phase * (3 - 2 * phase);
      particle.position.set(start[0] * (1 - eased), start[1] * (1 - eased), start[2] * (1 - eased) + Math.sin(time * 2 + index) * 0.08);
      const scale = 0.45 + (1 - phase) * 0.75;
      particle.scale.setScalar(scale);
    });
  });

  return <group>{Array.from({ length: count }, (_, index) => <mesh key={index} ref={(node) => { particles.current[index] = node; }}><sphereGeometry args={[0.05 + (index % 3) * 0.01, 10, 10]} /><meshBasicMaterial color={index % 3 === 0 ? "#c4b5fd" : "#67e8f9"} transparent opacity={0.85} /></mesh>)}</group>;
}

function StageNodes({ state, compact, onStageSelect }: { readonly state: CoreState; readonly compact: boolean; readonly onStageSelect?: (stage: IntelligenceStage) => void }) {
  const activeStage = intelligenceStageIndex(state);
  const color = stateColors[state];

  return <group>{intelligenceStages.map((stage, index) => {
    const position = stagePositions[index]!;
    const active = index === activeStage;
    const passed = index < activeStage || state === "learning";
    const nodeColor = active ? color : passed ? "#57e5c7" : "#6d85aa";
    const Icon = stage.icon;
    return <group key={stage.id} position={position}>
      <line>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, 0, -position[0], -position[1], -position[2]]), 3]} /></bufferGeometry>
        <lineDashedMaterial color={active ? color : "#4880aa"} transparent opacity={active ? 0.85 : 0.23} dashSize={0.16} gapSize={0.1} />
      </line>
      <mesh
        onClick={(event) => { event.stopPropagation(); onStageSelect?.(stage); }}
        onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}
      >
        <sphereGeometry args={[active ? 0.17 : 0.115, 16, 16]} />
        <meshBasicMaterial color={nodeColor} />
      </mesh>
      <pointLight color={nodeColor} intensity={active ? 1.8 : 0.4} distance={active ? 2.6 : 1.2} />
      <Html
        center
        distanceFactor={8}
        position={[0, active ? 0.43 : 0.3, 0]}
        style={{ pointerEvents: compact && !active ? "none" : "auto" }}
      >
        <button
          type="button"
          className={`core-stage-label ${active ? "is-active" : ""} ${compact && !active ? "core-stage-label--compact-hidden" : ""}`}
          onClick={() => onStageSelect?.(stage)}
          tabIndex={compact && !active ? -1 : undefined}
        >
          <span className="core-stage-label__dot" /><Icon size={10} aria-hidden="true" />{stage.label}
        </button>
      </Html>
    </group>;
  })}</group>;
}

function CustomerNodes({ customers, customerStates, onCustomerSelect, compact }: { readonly customers: readonly Customer[]; readonly customerStates?: Readonly<Record<string, "stable" | "declining" | "growing" | "irregular" | "inactive" | "insufficient_data">>; readonly onCustomerSelect?: (customerId: string) => void; readonly compact: boolean }) {
  const customerLimit = compact ? 8 : 18;
  return <group>{customers.slice(0, customerLimit).map((customer, index) => {
    const angle = (index / Math.max(customers.slice(0, customerLimit).length, 1)) * Math.PI * 2 - 0.6;
    const radius = 3.35 + (index % 2) * 0.42;
    const position: [number, number, number] = [Math.cos(angle) * radius, ((index % 3) - 1) * 0.78, Math.sin(angle) * radius - 0.7];
    const behavior = customerStates?.[customer.id];
    const color = behavior === "declining" || behavior === "inactive" ? "#fbbf24" : behavior === "irregular" ? "#fb7185" : behavior === "insufficient_data" ? "#94a3b8" : behavior === "growing" ? "#34d399" : "#67e8f9";
    return <mesh key={customer.id} position={position} onClick={(event) => { event.stopPropagation(); onCustomerSelect?.(customer.id); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}><sphereGeometry args={[0.09 + Math.min(customer.totalPayments, 8) * 0.012, 14, 14]} /><meshBasicMaterial color={color} /></mesh>;
  })}</group>;
}

export default function IntelligenceScene({ state, customers, customerStates, onCustomerSelect, onStageSelect, compact }: { readonly state: CoreState; readonly customers: readonly Customer[]; readonly customerStates?: Readonly<Record<string, "stable" | "declining" | "growing" | "irregular" | "inactive" | "insufficient_data">>; readonly onCustomerSelect?: (customerId: string) => void; readonly onStageSelect?: (stage: IntelligenceStage) => void; readonly compact: boolean }) {
  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-[1.4rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_50%_48%,rgba(34,211,238,0.15),rgba(15,23,42,0.04)_35%,transparent_70%)]">
      <Canvas dpr={compact ? [1, 1.2] : [1, 1.5]} camera={{ fov: 42, position: [0, 0.7, 10] }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} fallback={<CoreFallback state={state} />}>
        <ambientLight intensity={0.32} />
        <fog attach="fog" args={["#081021", 8, 18]} />
        <CoreOrb state={state} />
        <OrbitalRing radius={2.02} rotation={[0.68, 0, 0]} color="#67e8f9" speed={0.12} />
        <OrbitalRing radius={2.5} rotation={[1.42, 0.35, 0.8]} color="#c4b5fd" speed={-0.08} />
        <OrbitalRing radius={3.08} rotation={[0.25, 0.75, -0.5]} color="#67e8f9" speed={0.045} />
        <ParticleField compact={compact} />
        <DataFlow state={state} compact={compact} />
        <StageNodes state={state} compact={compact} onStageSelect={onStageSelect} />
        <CustomerNodes customers={customers} customerStates={customerStates} onCustomerSelect={onCustomerSelect} compact={compact} />
        <OrbitControls enablePan={false} enableZoom={false} enableDamping dampingFactor={0.04} autoRotate autoRotateSpeed={0.25} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-5 top-5 flex items-start justify-between text-[9px] font-semibold uppercase tracking-[0.19em] text-cyan-100/75"><span>Live intelligence field</span><span>Seven-stage loop</span></div>
      <div className="holo-scanlines absolute inset-0" aria-hidden="true" />
    </div>
  );
}
