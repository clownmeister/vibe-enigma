import { describe, expect, it } from 'vitest';
import { createMachine, encode, type MachineConfig } from './enigma';

// The machine the lounge API describes on 2026-10-30, pinned so the suite
// runs offline. scripts/selftest.mjs checks the live API.
const ENIGMA_I: MachineConfig = {
  rotors: [
    { name: 'I', wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
    { name: 'II', wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
    { name: 'III', wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
  ],
  reflector: { name: 'B', wiring: 'YRUHQSLDPXNGOKMIEBFZCWVJAT' },
  rings: 'AAA',
  plugboard: ['DE', 'VF', 'ST'],
};

describe('Enigma I', () => {
  it('matches the API test vector', () => {
    expect(encode(ENIGMA_I, 'AAA', 'HELLO DEVFEST')).toBe('IABEA NVTNZMA');
  });

  it('is reciprocal', () => {
    expect(encode(ENIGMA_I, 'AAA', 'IABEA NVTNZMA')).toBe('HELLO DEVFEST');
  });

  it('decodes a real transmission', () => {
    const cipher =
      '16:30 EUOOTPMJV: WJBMO, WOUV FWUISMI QTW JUDU RPMNHEZUEB, OIBD KBFWC JL ETPOV / DYJJ SCKTIPH, IGADM ZMHB';
    expect(encode(ENIGMA_I, 'YMJ', cipher)).toBe(
      '16:30 SPEAKEASY: GENUI, LLMS DRIVING THE USER EXPERIENCE, WHAT COULD GO WRONG / JUAN DELGADO, BRIAN EGAN',
    );
  });

  it('passes digits and punctuation through without stepping', () => {
    const m = createMachine(ENIGMA_I, 'AAA');
    m.encode('12:30 / ,');
    expect(m.positions()).toBe('AAA');
  });

  it('steps the right rotor before every letter', () => {
    const m = createMachine(ENIGMA_I, 'AAA');
    m.encodeChar('A');
    expect(m.positions()).toBe('AAB');
  });

  it('turns the middle rotor when the right one leaves its notch', () => {
    // rotor III notch is V: at AAV the next keypress moves the middle rotor too
    const m = createMachine(ENIGMA_I, 'AAV');
    m.encodeChar('A');
    expect(m.positions()).toBe('ABW');
  });

  it('double-steps the middle rotor', () => {
    // classic sequence with I II III: ADU -> ADV -> AEW -> BFX
    const m = createMachine(ENIGMA_I, 'ADU');
    m.encodeChar('A');
    expect(m.positions()).toBe('ADV');
    m.encodeChar('A');
    expect(m.positions()).toBe('AEW');
    m.encodeChar('A');
    expect(m.positions()).toBe('BFX');
  });

  it('honours ring settings', () => {
    const ringed = { ...ENIGMA_I, rings: 'BBB' };
    expect(encode(ringed, 'AAA', 'HELLO')).not.toBe(encode(ENIGMA_I, 'AAA', 'HELLO'));
    expect(encode(ringed, 'AAA', encode(ringed, 'AAA', 'HELLO'))).toBe('HELLO');
  });

  it('reports the full signal path', () => {
    const { path } = createMachine(ENIGMA_I, 'AAA').encodeChar('A');
    // in, plug, 3 rotors, reflector, 3 rotors, plug
    expect(path).toHaveLength(10);
  });

  it('works with any rotor count', () => {
    const four = {
      ...ENIGMA_I,
      rotors: [...ENIGMA_I.rotors, ENIGMA_I.rotors[0] as (typeof ENIGMA_I.rotors)[number]],
    };
    const out = encode(four, 'AAAA', 'HELLO');
    expect(encode(four, 'AAAA', out)).toBe('HELLO');
  });
});
