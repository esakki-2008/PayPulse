"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { CoreFallback } from "./core-fallback";
import type { CoreState, Customer } from "@/types/domain";

const stateColors: Record<CoreState, string> = {
  idle: "#67e8f9",
  analyzing: "#38bdf8",
  insight_detected: "#fbbf24",
  recommending: "#a78bfa",
  awaiting_approval: "#fbbf24",
  approved: "#34d399",
  executing: "#c084fc",
  completed: "#2dd4bf",
  learning: "#67e8f9",
};

function CoreOrb({ state }: { readonly state: CoreState }) {
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const color = stateColors[state];

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (core.current) {
      const scale = 1 + Math.sin(time * 2.1) * 0.045;
      core.current.scale.setScalar(scale);
      core.current.rotation.y = time * 0.12;
    }
    if (shell.current) {
      shell.current.rotation.x = time * 0.08;
      shell.current.rotation.z = time * -0.06;
    }
  });

  return (
    <group>
      <pointLight color={color} intensity={4.5} distance={11} />
      <mesh ref={core}>
        <icosahedronGeometry args={[1.34, 5]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.25}
          roughness={0.18}
          metalness={0.38}
          clearcoat={1}
          clearcoatRoughness={0.12}
        />
      </mesh>
      <mesh ref={shell} scale={1.68}>
        <sphereGeometry args={[1, 34, 34]} />
        <meshPhysicalMaterial
          color="#bff8ff"
          transparent
          opacity={0.08}
          roughness={0.12}
          metalness={0.75}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function OrbitalRing({
  radius,
  rotation,
  color,
  speed,
}: {
  readonly radius: number;
  readonly rotation: [number, number, number];
  readonly color: string;
  readonly speed: number;
}) {
  const ring = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (ring.current) {
      ring.current.rotation.z = rotation[2] + clock.getElapsedTime() * speed;
    }
  });

  return (
    <group ref={ring} rotation={rotation}>
      <mesh>
        <torusGeometry args={[radius, 0.015, 10, 90]} />
        <meshBasicMaterial color={color} transparent opacity={0.72} />
      </mesh>
    </group>
  );
}

function ParticleField() {
  const positions = useMemo(() => {
    const points = new Float32Array(72 * 3);
    for (let index = 0; index < 72; index += 1) {
      const angle = index * 2.399963229728653;
      const radius = 2.8 + (index % 9) * 0.23;
      points[index * 3] = Math.cos(angle) * radius;
      points[index * 3 + 1] = ((index % 7) - 3) * 0.42;
      points[index * 3 + 2] = Math.sin(angle) * radius;
    }
    return points;
  }, []);
  const points = useRef<THREE.Points>(null);

  useFrame(({ clock }) => {
    if (points.current) {
      points.current.rotation.y = clock.getElapsedTime() * 0.025;
    }
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#a5f3fc" size={0.036} sizeAttenuation transparent opacity={0.8} />
    </points>
  );
}

function PaymentStream() {
  const stream = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (stream.current) {
      stream.current.rotation.y = clock.getElapsedTime() * -0.18;
    }
  });

  return (
    <group ref={stream} rotation={[0.45, 0, -0.3]}>
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (index / 10) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * 2.65, Math.sin(angle) * 1.1, 0]}>
            <sphereGeometry args={[0.045 + (index % 3) * 0.012, 10, 10]} />
            <meshBasicMaterial color={index % 2 === 0 ? "#67e8f9" : "#c4b5fd"} />
          </mesh>
        );
      })}
    </group>
  );
}

function CustomerNodes({
  customers,
  customerStates,
  onCustomerSelect,
}: {
  readonly customers: readonly Customer[];
  readonly customerStates?: Readonly<Record<string, "stable" | "declining" | "growing" | "irregular" | "inactive" | "insufficient_data">>;
  readonly onCustomerSelect?: (customerId: string) => void;
}) {
  return (
    <group>
      {customers.map((customer, index) => {
        const angle = (index / customers.length) * Math.PI * 2 - 0.6;
        const radius = 3.45 + (index % 2) * 0.38;
        const position: [number, number, number] = [
          Math.cos(angle) * radius,
          ((index % 3) - 1) * 0.82,
          Math.sin(angle) * radius,
        ];
        const behavior = customerStates?.[customer.id];
        const color = behavior === "declining" || behavior === "inactive" ? "#fbbf24" : behavior === "irregular" ? "#fb7185" : behavior === "insufficient_data" ? "#94a3b8" : behavior === "growing" ? "#34d399" : "#67e8f9";

        return (
          <mesh
            key={customer.id}
            position={position}
            onClick={(event) => {
              event.stopPropagation();
              onCustomerSelect?.(customer.id);
            }}
          >
            <sphereGeometry args={[0.115, 16, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function IntelligenceScene({
  state,
  customers,
  customerStates,
  onCustomerSelect,
}: {
  readonly state: CoreState;
  readonly customers: readonly Customer[];
  readonly customerStates?: Readonly<Record<string, "stable" | "declining" | "growing" | "irregular" | "inactive" | "insufficient_data">>;
  readonly onCustomerSelect?: (customerId: string) => void;
}) {
  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-[1.4rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_50%_48%,rgba(34,211,238,0.11),rgba(15,23,42,0.06)_34%,transparent_66%)]">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 42, position: [0, 1.2, 10] }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        fallback={<CoreFallback state={state} />}
      >
        <ambientLight intensity={0.35} />
        <fog attach="fog" args={["#081021", 8, 18]} />
        <CoreOrb state={state} />
        <OrbitalRing radius={2.03} rotation={[0.68, 0, 0]} color="#67e8f9" speed={0.12} />
        <OrbitalRing radius={2.5} rotation={[1.42, 0.35, 0.8]} color="#c4b5fd" speed={-0.08} />
        <OrbitalRing radius={3.06} rotation={[0.25, 0.75, -0.5]} color="#67e8f9" speed={0.045} />
        <ParticleField />
        <PaymentStream />
        <CustomerNodes customers={customers} customerStates={customerStates} onCustomerSelect={onCustomerSelect} />
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.42} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-5 top-5 flex items-start justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
        <span>Payment universe</span>
        <span>Interactive nodes</span>
      </div>
    </div>
  );
}
