import type { MachineConfig, ReflectorSpec, RotorSpec } from './enigma';

export interface MachineDescription extends MachineConfig {
  machine?: string;
  reflectors?: ReflectorSpec[];
  testVector?: { start: string; plaintext: string; ciphertext: string };
}

export interface Transmission {
  number: number;
  start: string;
  ciphertext: string;
  sentAt?: string;
}

export const DEFAULT_API = 'https://devfest-vibe-lounge.web.app/api';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  return (await res.json()) as T;
}

export function fetchMachine(base: string): Promise<MachineDescription> {
  return getJson<MachineDescription>(`${base}/enigma`);
}

export async function fetchTransmissions(base: string): Promise<Transmission[]> {
  const body = await getJson<{ transmissions?: Transmission[] }>(`${base}/transmissions`);
  return body.transmissions ?? [];
}

export function rotorByName(bank: RotorSpec[], name: string): RotorSpec | undefined {
  return bank.find((r) => r.name === name);
}
